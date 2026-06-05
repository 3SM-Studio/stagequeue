# Realtime Change Checklist

- [ ] Mechanism choice is justified: polling/SSE/WebSocket/webhook/job/pubsub.
- [ ] Auth and resource authorization defined.
- [ ] Reconnect behavior defined.
- [ ] Heartbeat/timeout behavior defined.
- [ ] Cleanup/unsubscribe behavior defined.
- [ ] Rate limits and connection limits considered.
- [ ] Multi-instance fan-out strategy defined.
- [ ] Message/event names are stable.
- [ ] Backpressure and payload size considered.
- [ ] Tests or manual QA cover disconnect/reconnect.
