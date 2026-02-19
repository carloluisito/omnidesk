export type TunnelStatus = 'creating' | 'active' | 'stopping' | 'stopped' | 'error';
export type TunnelProtocol = 'http' | 'tcp';

export interface TunnelInfo {
  id: string;
  name: string;
  port: number;
  protocol: TunnelProtocol;
  url: string;
  status: TunnelStatus;
  createdAt: string;
  expiresAt?: string;
  subdomain?: string;
  hasAuth?: boolean;
  hasInspect?: boolean;
  pid?: number;
  isLocal: boolean;
}

export interface TunnelCreateRequest {
  port: number;
  name?: string;
  protocol?: TunnelProtocol;
  expires?: string;
  auth?: string;
  subdomain?: string;
  inspect?: boolean;
}

export interface TunnelSettings {
  apiKey: string;
  apiBaseUrl: string;
  autoRefreshIntervalMs: number;
  defaultProtocol: TunnelProtocol;
  defaultExpires?: string;
  ltBinaryPath?: string;
}

export interface TunnelAccountInfo {
  email?: string;
  plan?: string;
  status?: string;
}

export interface TunnelUsageStats {
  totalRequests?: number;
  bandwidth?: number;
  period?: string;
}

export interface TunnelRequestLog {
  id: string;
  method: string;
  path: string;
  statusCode: number;
  timestamp: string;
  duration: number;
  size: number;
}

export interface TunnelOperationResult {
  success: boolean;
  message: string;
  errorCode?: TunnelErrorCode;
}

export type TunnelErrorCode =
  | 'NO_API_KEY'
  | 'INVALID_API_KEY'
  | 'CLI_NOT_FOUND'
  | 'PORT_IN_USE'
  | 'TUNNEL_LIMIT_REACHED'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'UNKNOWN';

export interface TunnelCreatedEvent { tunnel: TunnelInfo; }
export interface TunnelStoppedEvent { tunnelId: string; }
export interface TunnelErrorEvent { tunnelId: string; error: string; }
export interface TunnelOutputEvent { tunnelId: string; data: string; }
