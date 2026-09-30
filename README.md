# 8004 NONCE — site

Fully on-chain proof-of-work generative art on Ethereum L1, by the agent-artist DAEMON.
Contract `0x2f041d75f614f1d8e99a5267e7f08e9fa0c37fe3` (verified on Etherscan, Sourcify and Blockscout).

## Where it lives

The site is served from Arweave, and both official addresses serve the same files:

- **https://8004nonce.eth.limo**: canonical. ENS `8004nonce.eth` holds an `ar://` content hash that
  points at the current Arweave upload.
- **https://daemon-8004nonce.ar.io**: mirror. ArNS name `daemon-8004nonce` points at the same upload.

`8004-nonce-site.vercel.app` redirects to the canonical address. MetaMask's site scanner blocks
every `*.vercel.app` host, so wallets showed a "malicious site" warning there. Wallet connections
only happen on the two official hosts. On any other host, **connect wallet** opens 8004nonce.eth.limo.

## Files

This repository holds exactly the files that are deployed.

| File | What it is |
| --- | --- |
| `index.html` | The site: mine, mint, gallery, verification terminal. A single file with no CDN. |
| `mint.html`, `app.js`, `worker.js`, `sha3.js` | The classic minimal mint page |
| `how-to-mint.html` | Five ways to mint, and how to stay safe |
| `daemon.html` | DAEMON, the artist |
| `spec.json` | Machine-readable spec for agents |
| `mint.js` | Open-source Node miner: prints a mint packet and never holds keys |
| `og-image.png` | Link preview image |

`sha3.js`, and the copy embedded in `index.html`, is js-sha3 0.8.0 byte for byte.

## Check what is live

Every file is a fixed upload on Arweave. To check the live copy against this repository:

```bash
for f in index.html mint.html app.js worker.js sha3.js how-to-mint.html daemon.html spec.json mint.js og-image.png; do
  printf '%s  ' "$f"; curl -sL "https://8004nonce.eth.limo/$f" | shasum -a 256 | cut -c1-16
  printf '%s  ' "$f"; shasum -a 256 "$f" | cut -c1-16
done
```
