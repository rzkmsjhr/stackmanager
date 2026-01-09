use std::convert::Infallible;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use std::collections::HashMap;

use http_body_util::{Full, BodyExt}; 
use hyper::body::Bytes;
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper::{Request, Response, StatusCode};
use hyper_util::rt::TokioIo;
use tokio::net::{TcpListener, TcpStream};

pub struct ProxyState {
    pub routes: Mutex<HashMap<String, u16>>,
}

impl ProxyState {
    pub fn new() -> Self {
        Self {
            routes: Mutex::new(HashMap::new()),
        }
    }
}

async fn handle_request(
    req: Request<hyper::body::Incoming>,
    state: Arc<ProxyState>, 
) -> Result<Response<Full<Bytes>>, Infallible> {
    let host_header = req.headers().get("host")
        .and_then(|h| h.to_str().ok())
        .unwrap_or_default()
        .to_string(); 

    let host_key = host_header.split(':').next().unwrap_or(&host_header).to_string();

    let target_port = {
        let map = state.routes.lock().unwrap();
        map.get(&host_key).cloned()
    };

    if let Some(port) = target_port {
        let (req_parts, req_body) = req.into_parts();
        let req_bytes = match req_body.collect().await {
            Ok(collected) => collected.to_bytes(),
            Err(_) => return Ok(Response::builder().status(StatusCode::BAD_REQUEST).body(Full::new(Bytes::from("Bad Request Body"))).unwrap())
        };

        let stream = match TcpStream::connect(format!("127.0.0.1:{}", port)).await {
            Ok(s) => s,
            Err(_) => return Ok(Response::builder()
                .status(StatusCode::BAD_GATEWAY)
                .body(Full::new(Bytes::from("StackManager: Project server not running.")))
                .unwrap()),
        };

        let io = TokioIo::new(stream);
        let (mut sender, conn) = hyper::client::conn::http1::handshake(io).await.unwrap();

        tokio::task::spawn(async move {
            if let Err(err) = conn.await {
                println!("Connection failed: {:?}", err);
            }
        });

        let mut builder = Request::builder()
            .method(req_parts.method)
            .uri(req_parts.uri);

        for (key, value) in req_parts.headers.iter() {
            builder = builder.header(key, value);
        }

        builder = builder.header("Host", &host_header);

        let upstream_req = builder
            .body(Full::new(req_bytes)) 
            .unwrap();

        if let Ok(res) = sender.send_request(upstream_req).await {
            let (parts, body) = res.into_parts();
            let body_bytes = body.collect().await.unwrap().to_bytes();

            let mut resp_builder = Response::builder().status(parts.status);
            
            for (key, value) in parts.headers.iter() {
                resp_builder = resp_builder.header(key, value);
            }

            return Ok(resp_builder
                .body(Full::new(body_bytes)) 
                .unwrap());
        }
    }

    Ok(Response::builder()
        .status(StatusCode::NOT_FOUND)
        .body(Full::new(Bytes::from("StackManager: Site Not Found.")))
        .unwrap())
}

pub async fn start_proxy_server(state: Arc<ProxyState>) {
    let addr = SocketAddr::from(([0, 0, 0, 0], 80));

    let listener = match TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("Failed to bind Port 80: {}. Proxy disabled.", e);
            return;
        }
    };

    println!("Reverse Proxy Listening on http://localhost:80");

    loop {
        let (stream, _) = match listener.accept().await {
            Ok(s) => s,
            Err(_) => continue,
        };

        let io = TokioIo::new(stream);
        let state_clone = state.clone();

        tokio::task::spawn(async move {
            if let Err(err) = http1::Builder::new()
                .serve_connection(io, service_fn(move |req| handle_request(req, state_clone.clone())))
                .await
            {
                eprintln!("Error serving connection: {:?}", err);
            }
        });
    }
}

#[tauri::command]
pub fn register_proxy_route(
    state: tauri::State<Arc<ProxyState>>,
    domain: String,
    port: u16
) -> Result<String, String> {
    let mut routes = state.routes.lock().unwrap();
    routes.insert(domain.clone(), port);
    Ok(format!("Routed {} -> {}", domain, port))
}