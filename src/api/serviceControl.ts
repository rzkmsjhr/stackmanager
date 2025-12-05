import { invoke } from '@tauri-apps/api/core';

export interface ServiceLaunchConfig {
  id: string;
  binPath: string;
  args: string[];
  cwd?: string;
  envPaths?: string[];
  port?: number;
}

export const ServiceAPI = {
  start: async (config: ServiceLaunchConfig): Promise<string> => {
    try {
      const response = await invoke<string>('start_service', {
        id: config.id,
        binPath: config.binPath,
        args: config.args,
        cwd: config.cwd || null,
        envPaths: config.envPaths || null,
        port: config.port || null
      });
      console.log('Backend response:', response);
      return response;
    } catch (error) {
      console.error('Failed to start service:', error);
      throw error;
    }
  },

  stop: async (id: string): Promise<string> => {
    try {
      return await invoke<string>('stop_service', { id });
    } catch (error) {
      throw error;
    }
  }
};