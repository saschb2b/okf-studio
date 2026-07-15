export interface CustomAgentInput {
  name: string;
  executable: string;
  arguments: readonly string[];
  environment: readonly string[];
}

export interface CustomAgentProfile extends CustomAgentInput {
  id: string;
}
