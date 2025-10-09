declare module "resend" {
  export interface SendEmailPayload {
    from: string;
    to: string | string[];
    subject: string;
    html?: string;
    text?: string;
  }

  export interface ResendEmailsApi {
    send(payload: SendEmailPayload): Promise<unknown>;
  }

  export class Resend {
    constructor(apiKey: string);
    emails: ResendEmailsApi;
  }

  const ResendClient: typeof Resend;
  export default ResendClient;
}
