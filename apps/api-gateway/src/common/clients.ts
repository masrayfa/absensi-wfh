/**
 * DI tokens for the TCP clients registered in AppModule. Inject with
 * `@Inject(CLIENT_AUTH) private readonly auth: ClientProxy` from any
 * gateway service. Never type the raw string at the call site.
 */
export const CLIENT_AUTH = 'AUTH';
export const CLIENT_EMPLOYEE = 'EMPLOYEE';
export const CLIENT_ATTENDANCE = 'ATTENDANCE';
