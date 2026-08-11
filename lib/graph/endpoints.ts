const GLOBAL_GRAPH_ENDPOINT = "https://graph.microsoft.com";

/**
 * Get the Microsoft Graph endpoint for the supported global cloud.
 */
export function getGraphEndpoint(): string {
  return GLOBAL_GRAPH_ENDPOINT;
}
