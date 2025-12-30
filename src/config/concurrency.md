# Concurrent User Handling

This application is configured to handle concurrent users professionally with the following features:

## Rate Limiting

### General API Rate Limiting
- **Limit**: 100 requests per 15 minutes per IP address
- **Purpose**: Prevents abuse and ensures fair resource usage
- **Applied to**: All `/api/*` routes except health checks

### Authentication Rate Limiting
- **Limit**: 5 requests per 15 minutes per IP address
- **Purpose**: Prevents brute force attacks
- **Applied to**: `/api/auth/login` and `/api/auth/register`
- **Feature**: Only counts failed attempts (skipSuccessfulRequests: true)

### Speed Limiting
- **Threshold**: 50 requests per 15 minutes
- **Behavior**: After threshold, adds 500ms delay per request
- **Max Delay**: 20 seconds
- **Purpose**: Gradual throttling instead of hard blocking

## Request Timeouts

- **Server Timeout**: 30 seconds
- **Keep-Alive Timeout**: 65 seconds
- **Headers Timeout**: 66 seconds
- **Purpose**: Prevents hanging requests from consuming resources

## Connection Pooling

Supabase client is configured with:
- Automatic connection pooling (handled by Supabase)
- Optimized for concurrent requests
- No session persistence (server-side)
- Proper client headers for tracking

## Request Tracking

- **Request ID**: Unique UUID for each request
- **Header**: `X-Request-ID` in response
- **Purpose**: Track and debug concurrent requests
- **Error Logging**: All errors include request ID

## Security

- **Helmet**: Security headers (CSP, XSS protection, etc.)
- **CORS**: Configurable origins (set via `CORS_ORIGIN` env var)
- **Body Size Limits**: 10MB max request body
- **Trust Proxy**: Configured for accurate IP detection

## Graceful Shutdown

- Handles SIGTERM and SIGINT signals
- Stops accepting new connections
- Allows existing requests to complete
- Force shutdown after 10 seconds if needed
- Handles uncaught exceptions and unhandled rejections

## Performance Optimizations

1. **Compression**: Gzip compression for all responses
2. **Batch Operations**: Database queries optimized for batch operations
3. **Async Operations**: Non-blocking async operations (e.g., email sending)
4. **Error Handling**: Proper error handling prevents crashes

## Monitoring

- Health check endpoint: `GET /health`
- Returns: Status, timestamp, and uptime
- No rate limiting applied

## Environment Variables

```env
PORT=3000
CORS_ORIGIN=*  # Configure allowed origins in production
NODE_ENV=production  # Affects error message verbosity
```

## Best Practices

1. **Database Queries**: Use batch operations where possible
2. **Error Handling**: Always use asyncHandler for route handlers
3. **Logging**: Include requestId in logs for debugging
4. **Rate Limits**: Adjust based on your application needs
5. **Timeouts**: Monitor and adjust based on your use case

