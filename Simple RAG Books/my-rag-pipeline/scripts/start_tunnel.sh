#!/bin/bash
autossh -M 0 -o "ServerAliveInterval 30" -o "ServerAliveCountMax 3" -o "ExitOnForwardFailure yes" -f -N -L 8000:localhost:8000 -p 11996 root@213.173.108.221 -i ~/.ssh/id_ed25519