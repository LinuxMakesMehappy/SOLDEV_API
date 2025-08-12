import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { handler } from '../../src/handlers/lambda-handler';

describe('Lambda Handler', () => {
  const mockEvent = {} as APIGatewayProxyEvent;
  const mockContext = {} as Context;

  it('should return a successful response', async () => {
    const result = await handler(mockEvent, mockContext);

    expect(result.statusCode).toBe(200);
    expect(result.headers).toHaveProperty('Content-Type', 'application/json');
    expect(result.headers).toHaveProperty('Access-Control-Allow-Origin', '*');
    
    const body = JSON.parse(result.body);
    expect(body).toHaveProperty('message');
    expect(body).toHaveProperty('timestamp');
    expect(body.message).toBe('Solana Error API - Implementation in progress');
  });

  it('should include CORS headers', async () => {
    const result = await handler(mockEvent, mockContext);

    expect(result.headers).toHaveProperty('Access-Control-Allow-Origin', '*');
    expect(result.headers).toHaveProperty('Access-Control-Allow-Headers', 'Content-Type');
    expect(result.headers).toHaveProperty('Access-Control-Allow-Methods', 'POST, OPTIONS');
  });
});