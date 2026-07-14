# Chac — Frequently Asked Questions

---

### How do I test this on my Android phone?

Chac runs a local web server on your computer. Any device on the same Wi-Fi network can access it through a browser — no app install needed.

**Steps:**

1. Start Chac on your computer (double-click the launcher or run `bun run dev`)
2. Make sure your phone and computer are on the **same Wi-Fi network**
3. On your phone, open a browser and go to:

   ```
   http://<your-computer-ip>:3000
   ```

   (See [How do I find my computer's IP address?](#how-do-i-find-my-computers-ip-address-to-connect-the-app) below)

4. The full Chac interface loads — Chat, Documents, Wiki, Settings tabs all work

**Note:** The UI was designed for desktop browsers. On a narrow phone screen, the sidebar may overlap the chat area. Rotate to landscape for a better experience.

---

### How do I set up llama.cpp server on my computer?

Chac manages llama.cpp automatically. You just need to place the binaries and models in the right locations.

**1. Place llama.cpp binaries**

Download the `llama-server` binary for your platform and put it here:

```
usb-drive/bin/llama.cpp/llama-server/
├── linux-x64/llama-server       # Linux x86_64
├── linux-arm64/llama-server     # Linux ARM64
├── darwin-arm64/llama-server    # macOS Apple Silicon
├── darwin-x64/llama-server      # macOS Intel
└── windows-x64/llama-server.exe # Windows
```

You can build from source ([github.com/ggml-org/llama.cpp](https://github.com/ggml-org/llama.cpp)) or download pre-built releases.

**2. Place model files**

Put your GGUF models in the `models/` directory:

```
usb-drive/models/
├── chat.gguf      # Chat model (~1.7 GB, e.g. MiniCPM5-1B)
├── embed.gguf     # Embedding model (~130 MB, e.g. nomic-embed-text-v2-moe)
└── vision.gguf    # Vision model (~505 MB, optional)
```

**3. Start Chac**

Run the launcher. Chac will:
- Detect your platform and architecture
- Spawn `llama-server` instances on ports 8080+ (one for chat, one for embeddings)
- Serve the web UI on port 3000

If llama.cpp binaries aren't found, Chac runs in **dev mode** with mock responses — you can still test the UI without downloading anything.

---

### How do I enable audio/video transcription?

Chac supports transcribing audio and video files using Whisper.cpp. To enable it:

**1. Place Whisper.cpp binary**

Download the `whisper-cli` binary for your platform and put it here:

```
usb-drive/bin/whisper.cpp/
├── linux-x64/whisper-cli       # Linux x86_64
├── linux-arm64/whisper-cli     # Linux ARM64
├── darwin-arm64/whisper-cli    # macOS Apple Silicon
├── darwin-x64/whisper-cli      # macOS Intel
└── windows-x64/whisper-cli.exe # Windows
```

You can build from source ([github.com/ggerganov/whisper.cpp](https://github.com/ggerganov/whisper.cpp)) or download pre-built releases.

**2. Configure in Settings**

Go to Settings → Transcription:
- **Model**: `tiny` (fastest), `base` (balanced), `small`, `medium`, `large` (most accurate)
- **Language**: `auto` for automatic detection, or a specific code like `en`, `es`, `fr`
- **Threads**: CPU threads for transcription (default: 4)

**3. Add media files**

Once Whisper.cpp is installed, you can add audio and video files just like text documents. Chac will automatically:
- Detect the media format
- Transcribe the audio/video content
- Store the transcription for search and retrieval
- Show the transcription in the document details

If Whisper.cpp isn't found, Chac returns a placeholder message and continues normally.

---

### How does image ingestion work?

Chac uses a vision model to describe images for indexing and search. When you add an image file:

1. **Format detection** — Magic bytes identify JPEG, PNG, WebP, GIF, BMP, and TIFF files
2. **Vision description** — The vision model generates a text description of the image content
3. **Indexing** — The description is stored and chunked for semantic search
4. **Retrieval** — You can ask questions about images in chat, and the vision description is used as context

**Supported image formats:** `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`, `.bmp`, `.tiff`

**Adding images:**
- Click "+ Add Document" and select an image file
- Or drag and drop an image onto the document list
- The vision model processes the image automatically

**Settings:** Configure the vision model in Settings → LLM → Vision. Default: `openbmb/MiniCPM-V-4.6`.

---

### How do I find my computer's IP address to connect the app?

Chac runs on port `3000` by default. You need your computer's local network IP:

**Linux:**
```bash
ip addr | grep "inet " | grep -v 127.0.0.1
```
Look for an address like `192.168.1.x` or `10.0.0.x`.

**macOS:**
```bash
ipconfig getifaddr en0
```

**Windows:**
```cmd
ipconfig
```
Look for "IPv4 Address" under your Wi-Fi adapter.

Then on your phone, open:
```
http://192.168.1.x:3000
```

---

### How do I connect the app to the server?

The frontend uses **relative URLs** for all API calls — no configuration needed. Just point your phone's browser at the right address:

1. Find your computer's IP (see above)
2. On your phone browser, go to `http://<computer-ip>:3000`
3. The interface loads and all API calls automatically route to the same server

There's nothing to configure. The frontend is served by the same server that handles the API, so any address that reaches the server works.

---

### It's connected! How do I add my documents?

1. Open Chac in your browser
2. Click the **Documents** tab
3. Click **"+ Add Document"**
4. A dialog asks for a **file path** — type the path to a text file on the computer running Chac

   ```
   /home/user/Documents/my-notes.txt
   ```

   or on Windows:
   ```
   C:\Users\you\Documents\my-notes.txt
   ```

5. Chac will:
   - Read the file
   - Split it into ~500 character chunks
   - Generate embeddings using the local AI model
   - Store everything in its database

6. The document appears in the list with its chunk count

**Supported formats:** Text files (`.txt`, `.md`, `.csv`, `.json`, `.log`), documents (`.pdf`, `.docx`), HTML (`.html`), images (`.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`, `.bmp`, `.tiff`), audio files (`.mp3`, `.wav`, `.flac`, `.ogg`, `.m4a`), and video files (`.mp4`, `.mkv`, `.mov`, `.webm`).

**Audio/Video:** Chac transcribes audio and video files locally using Whisper.cpp (if installed). Each media file gets its own transcription and can be searched just like text documents.

**URLs:** You can also add web pages by URL — click **"+ Add from URL"** and paste a link. Chac extracts the page content and generates a description automatically.

**Important:** The file must exist on the computer running Chac, not on your phone. You're typing a server-side file path.

**Optional: Compile a Wiki**

After adding documents, click **Wiki** → **"Compile Wiki"**. Chac uses the LLM to synthesize your documents into structured wiki entries. This improves search quality because Chac queries wiki entries first, falling back to raw chunks only when needed.

---

### How do I start chatting with my documents?

1. Make sure you've added at least one document (see above)
2. Click the **Chat** tab
3. Click **"+ New Session"** to create a conversation
4. Type your question in the text box and press **Send**

Chac will:
- Search your documents for relevant content
- Find the most similar chunks (or wiki entries)
- Build a context prompt with those results
- Send everything to the LLM
- Return the answer

**Tips:**
- Ask specific questions about your documents — "What does the report say about Q3 revenue?" works better than "Tell me about the report"
- Each session keeps its conversation history, so follow-up questions work
- If the answer seems off, try adding more documents or compiling a wiki for better retrieval

---

### How is Chac optimized for performance?

Chac includes several performance optimizations:

- **Transactional bulk operations** — chunk inserts, batch deletes, and document ingestion wrapped in SQLite transactions for 10-50x faster writes
- **Batch citation lookups** — single database query replaces N per-chunk queries when building RAG context
- **Targeted search** — document titles loaded only for search results, not the entire chunk table
- **VectorIndex singletons** — shared across services via dependency injection, reducing memory usage
- **HNSW vector search** — O(log n) approximate nearest neighbor with configurable tuning parameters
- **MemoryCache LRU** — embedding cache with eviction prevents unbounded memory growth
- **Token-aware context** — fills the LLM context window to capacity, not a fixed message count
- **Parallel ingestion** — bulk file processing in batches of 4 with isolated error handling
