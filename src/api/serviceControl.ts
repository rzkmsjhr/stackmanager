import { invoke } from '@tauri-apps/api/core';

// This maps to the Rust arguments in start_service
export interface ServiceLaunchConfig {
  id: string;          // Unique ID, e.g., "proj_1_php"
  binPath: string;     // Absolute path to executable, e.g., "C:/stack/php/php.exe"
  args: string[];      // e.g., ["-S", "127.0.0.1:8000", "-t", "public"]
}

export const ServiceAPI = {
  /**
   * Starts a service (PHP, Nginx, etc.)
   */
  start: async (config: ServiceLaunchConfig): Promise<string> => {
    try {
      // 'start_service' matches the command name in main.rs
      const response = await invoke<string>('start_service', {
        id: config.id,
        binPath: config.binPath,
        args: config.args,
      });
      console.log('Backend response:', response);
      return response;
    } catch (error) {
      console.error('Failed to start service:', error);
      throw error;
    }
  },

  /**
   * Stops a running service by ID
   */
  stop: async (id: string): Promise<string> => {
    try {
      const response = await invoke<string>('stop_service', { id });
      console.log('Backend response:', response);
      return response;
    } catch (error) {
      console.error('Failed to stop service:', error);
      throw error;
    }
  }
};