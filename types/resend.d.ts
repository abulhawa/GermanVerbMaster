declare module "resend" {
  export interface ResendEmailPayload {
    from: string;
    to: string | string[];
    subject: string;
    html?: string;
    text?: string;
  }

  export class Resend {
    constructor(apiKey: string);
    emails: {
      send(payload: ResendEmailPayload): Promise<unknown>;
    };
  }
}
