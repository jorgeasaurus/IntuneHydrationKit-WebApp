import { getAccessToken } from "@/lib/auth/authUtils";
import { getGraphEndpoint } from "@/lib/auth/msalConfig";
import { CloudEnvironment } from "@/types/hydration";
import { GraphResponse } from "@/types/graph";
import { retryWithBackoff } from "@/lib/utils/retry";

/**
 * Microsoft Graph API client with retry logic
 */
export class GraphClient {
  private baseUrl: string;
  private environment: CloudEnvironment;

  constructor(environment: CloudEnvironment = "global") {
    this.environment = environment;
    this.baseUrl = getGraphEndpoint(environment);
  }

  /**
   * Get authorization headers with access token
   */
  private async getHeaders(): Promise<HeadersInit> {
    const token = await getAccessToken();
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  }

  /**
   * Handle Graph API errors
   * Handles both standard Graph API error format and Intune-specific error format
   */
  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      let errorMessage = `Graph API error: ${response.status} ${response.statusText}`;

      try {
        const responseText = await response.text();
        if (responseText) {
          const errorData = JSON.parse(responseText);
          // Standard Graph API error format: { error: { message: "..." } }
          if (errorData.error?.message) {
            errorMessage = errorData.error.message;
          }
          // Intune-specific error format: { Message: "..." }
          else if (errorData.Message) {
            errorMessage = errorData.Message;
          }
          // Intune error format with nested details: { error: { code: "...", details: [...] } }
          else if (errorData.error?.code) {
            errorMessage = `${errorData.error.code}: ${errorData.error.details?.[0]?.message || errorData.error.message || "Unknown error"}`;
          }
          // Log full error for debugging
          console.error("[GraphClient] Full error response:", responseText);
        }
      } catch {
        // Failed to parse error response
      }

      const error = new Error(errorMessage) as Error & { status: number };
      error.status = response.status;
      throw error;
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return {} as T;
    }

    return response.json();
  }

  /**
   * GET request to Graph API
   */
  async get<T>(endpoint: string, version: "v1.0" | "beta" = "beta"): Promise<T> {
    const url = `${this.baseUrl}/${version}${endpoint}`;

    return retryWithBackoff(async () => {
      const headers = await this.getHeaders();
      const response = await fetch(url, {
        method: "GET",
        headers,
      });
      return this.handleResponse<T>(response);
    });
  }

  /**
   * GET request that returns a collection with automatic pagination
   */
  async getCollection<T>(
    endpoint: string,
    version: "v1.0" | "beta" = "beta"
  ): Promise<T[]> {
    const results: T[] = [];
    let nextLink: string | undefined = `${this.baseUrl}/${version}${endpoint}`;

    while (nextLink) {
      const response = await retryWithBackoff(async () => {
        const headers = await this.getHeaders();
        const res = await fetch(nextLink!, {
          method: "GET",
          headers,
        });
        return this.handleResponse<GraphResponse<T>>(res);
      });

      results.push(...response.value);
      nextLink = response["@odata.nextLink"];
    }

    return results;
  }

  /**
   * POST request to Graph API
   */
  async post<T>(
    endpoint: string,
    data: unknown,
    version: "v1.0" | "beta" = "beta"
  ): Promise<T> {
    const url = `${this.baseUrl}/${version}${endpoint}`;

    return retryWithBackoff(async () => {
      const headers = await this.getHeaders();
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(data),
      });
      return this.handleResponse<T>(response);
    });
  }

  /**
   * PATCH request to Graph API
   */
  async patch<T>(
    endpoint: string,
    data: unknown,
    version: "v1.0" | "beta" = "beta"
  ): Promise<T> {
    const url = `${this.baseUrl}/${version}${endpoint}`;

    return retryWithBackoff(async () => {
      const headers = await this.getHeaders();
      const response = await fetch(url, {
        method: "PATCH",
        headers,
        body: JSON.stringify(data),
      });
      return this.handleResponse<T>(response);
    });
  }

  /**
   * DELETE request to Graph API
   * Treats 404 as success (idempotent delete - if resource is gone, mission accomplished)
   */
  async delete(endpoint: string, version: "v1.0" | "beta" = "beta"): Promise<void> {
    const url = `${this.baseUrl}/${version}${endpoint}`;

    return retryWithBackoff(async () => {
      const headers = await this.getHeaders();
      const response = await fetch(url, {
        method: "DELETE",
        headers,
      });

      // Treat 404 as success for DELETE (idempotent - resource already gone)
      if (response.status === 404) {
        console.log(`[GraphClient] DELETE returned 404 - resource already deleted, treating as success`);
        return;
      }

      return this.handleResponse<void>(response);
    });
  }
}

/**
 * Create a new Graph API client instance
 */
export function createGraphClient(environment: CloudEnvironment = "global"): GraphClient {
  return new GraphClient(environment);
}
