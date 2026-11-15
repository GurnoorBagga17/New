# Docker Deployment Prototype (Team 1)

**Owner:** Team 1 (Gateway & Runtime Infrastructure)  
**Status:** Draft First Slice for Gate G1  

This directory contains draft containerization assets for the Axiom NHI MCP Security Gateway:

- `Dockerfile.agentgateway`: Packages `agentgateway:v1.7.0` with Axiom's standalone configuration.
- `docker-compose.yml`: Draft topology. The ExtMCP and MCP backend commands are idle placeholders, not listening services, so this Compose file is not a runnable stack.

The Compose syntax is valid, but no Docker runtime was available during the audit. ExtMCP gRPC, identity, validators, audit, and revocation are not assembled into containers. Do not use this topology as Gate G1 deployment evidence.
