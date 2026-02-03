/**
 * GitHub OAuth Device Flow Implementation
 *
 * The device flow allows CLI/desktop apps to authenticate without a callback URL:
 * 1. Request a device code from GitHub
 * 2. User goes to github.com/login/device and enters the code
 * 3. App polls GitHub until user completes authorization
 * 4. GitHub returns access token
 *
 * See: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow
 */

export interface DeviceCodeResponse {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}

export interface TokenResponse {
  accessToken: string;
  tokenType: string;
  scope: string;
}

export interface GitHubUser {
  login: string;
  name: string | null;
  avatarUrl: string;
}

// Polling states
export type PollStatus = 'pending' | 'success' | 'expired' | 'error';

export interface PollResult {
  status: PollStatus;
  token?: TokenResponse;
  error?: string;
}

// Store active device flow sessions (device_code -> pending state)
const activeSessions = new Map<string, {
  deviceCode: string;
  interval: number;
  expiresAt: number;
  clientId: string;
}>();

export class GitHubDeviceAuth {
  private clientId: string;

  constructor(clientId: string) {
    this.clientId = clientId;
  }

  /**
   * Step 1: Request a device code from GitHub
   * User will need to visit the verification URI and enter the user code
   */
  async requestDeviceCode(scope: string = 'repo'): Promise<DeviceCodeResponse> {
    const response = await fetch('https://github.com/login/device/code', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: this.clientId,
        scope,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to request device code: ${error}`);
    }

    const data = await response.json();

    const result: DeviceCodeResponse = {
      deviceCode: data.device_code,
      userCode: data.user_code,
      verificationUri: data.verification_uri,
      expiresIn: data.expires_in,
      interval: data.interval,
    };

    // Store session for polling
    activeSessions.set(result.deviceCode, {
      deviceCode: result.deviceCode,
      interval: result.interval,
      expiresAt: Date.now() + (result.expiresIn * 1000),
      clientId: this.clientId,
    });

    return result;
  }

  /**
   * Step 2: Poll for access token
   * Call this periodically (respecting the interval) until authorization completes
   */
  async pollForToken(deviceCode: string): Promise<PollResult> {
    const session = activeSessions.get(deviceCode);

    if (!session) {
      return { status: 'error', error: 'Device code session not found' };
    }

    // Check if expired
    if (Date.now() > session.expiresAt) {
      activeSessions.delete(deviceCode);
      return { status: 'expired', error: 'Device code has expired' };
    }

    try {
      const response = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: session.clientId,
          device_code: deviceCode,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }),
      });

      const data = await response.json();
      console.log(`[GitHub OAuth] Response status: ${response.status}, data:`, JSON.stringify(data, null, 2));

      // Check for errors
      if (data.error) {
        switch (data.error) {
          case 'authorization_pending':
            // User hasn't completed authorization yet - keep polling
            return { status: 'pending' };

          case 'slow_down':
            // Too many requests - increase interval
            session.interval += 5;
            return { status: 'pending' };

          case 'expired_token':
            activeSessions.delete(deviceCode);
            return { status: 'expired', error: 'Device code has expired' };

          case 'access_denied':
            activeSessions.delete(deviceCode);
            return { status: 'error', error: 'User denied authorization' };

          default:
            return { status: 'error', error: data.error_description || data.error };
        }
      }

      // Success! We got the token
      if (data.access_token) {
        activeSessions.delete(deviceCode);
        return {
          status: 'success',
          token: {
            accessToken: data.access_token,
            tokenType: data.token_type,
            scope: data.scope,
          },
        };
      }

      return { status: 'error', error: 'Unexpected response from GitHub' };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return { status: 'error', error: errorMsg };
    }
  }

  /**
   * Get the polling interval for a device code session
   */
  getPollingInterval(deviceCode: string): number {
    const session = activeSessions.get(deviceCode);
    return session?.interval || 5;
  }

  /**
   * Cancel an active device code session
   */
  cancelSession(deviceCode: string): void {
    activeSessions.delete(deviceCode);
  }

  /**
   * Get user info using an access token
   */
  async getUser(accessToken: string): Promise<GitHubUser> {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'User-Agent': 'ClaudeDesk-App',
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get user info: ${error}`);
    }

    const data = await response.json();

    return {
      login: data.login,
      name: data.name,
      avatarUrl: data.avatar_url,
    };
  }

  /**
   * Verify that an access token is still valid
   */
  async verifyToken(accessToken: string): Promise<boolean> {
    try {
      const response = await fetch('https://api.github.com/user', {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'ClaudeDesk-App',
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

/**
 * Create a new GitHub API client with an access token
 * For making authenticated GitHub API calls
 */
export class GitHubAPI {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private async request(endpoint: string, options: RequestInit = {}): Promise<any> {
    const url = endpoint.startsWith('https://')
      ? endpoint
      : `https://api.github.com${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${this.accessToken}`,
        'User-Agent': 'ClaudeDesk-App',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GitHub API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  async getUser(): Promise<GitHubUser> {
    const data = await this.request('/user');
    return {
      login: data.login,
      name: data.name,
      avatarUrl: data.avatar_url,
    };
  }

  async createRepo(name: string, isPrivate: boolean = true, description?: string): Promise<{
    name: string;
    fullName: string;
    htmlUrl: string;
    cloneUrl: string;
    sshUrl: string;
  }> {
    const data = await this.request('/user/repos', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        private: isPrivate,
        description,
        auto_init: false,
      }),
    });

    return {
      name: data.name,
      fullName: data.full_name,
      htmlUrl: data.html_url,
      cloneUrl: data.clone_url,
      sshUrl: data.ssh_url,
    };
  }

  async listRepos(page: number = 1, perPage: number = 30): Promise<Array<{
    name: string;
    fullName: string;
    htmlUrl: string;
    private: boolean;
  }>> {
    const data = await this.request(`/user/repos?page=${page}&per_page=${perPage}&sort=updated`);
    return data.map((repo: any) => ({
      name: repo.name,
      fullName: repo.full_name,
      htmlUrl: repo.html_url,
      private: repo.private,
    }));
  }
}
