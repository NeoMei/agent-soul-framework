---
name: nano-banana-pro
description: Generate/edit images with Nano Banana Pro (Gemini 3 Pro Image). Use for image create/modify requests incl. edits. Supports text-to-image + image-to-image; 1K/2K/4K; use --input-image.
---

# nano-banana-pro

Generate and edit images using the `nano-banana-pro` CLI.

## Usage
```bash
nano-banana-pro "A futuristic cityscape at night" --output-dir ~/Images/
```

## IMPORTANT: Sending Images to Feishu/Lark
When you generate an image using this tool and want to show it to the user in chat:
- **DO NOT** use the `read` tool to read the PNG/JPG file.
- **DO NOT** attempt to encode it as Base64 in your response. This will crash the Feishu websocket connection!
- **ONLY** output the absolute file path as a markdown image link: `![Generated Image](/absolute/path/to/image.png)`. OpenClaw will natively handle the upload and rendering to Feishu.
