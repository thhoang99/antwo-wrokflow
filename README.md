# 🌌 Antwo Workflow — Visual Node Workflow Editor

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Antwo Workflow** is an intuitive, visual node-based workflow editor and execution engine. It provides a modern canvas UI with smooth interactions, enabling you to build complex workflows by connecting functional blocks. You can easily process text, manage local files, execute shell commands, and run advanced artificial intelligence (AI) tasks powered by the Antigravity CLI.

> [!WARNING]
> **Vibe Coding Notice:** This project was developed utilizing "vibe coding" practices. Consequently, it is highly experimental, and there will likely be various bugs, quirky errors, or unhandled edge cases. Please run your workflows with a relaxed mind and positive vibes!

---

## ✨ Key Highlight: Powered by Antigravity 2

The core strength of this project lies in its deep integration with the **Antigravity** ecosystem. You can leverage your **Antigravity 2 account** to drive the entire execution engine:

*   **Seamless CLI Integration:** Direct binding to your Antigravity environment using the `agy` command-line utility.
*   **Advanced AI Capabilities:** Connect directly to Gemini models to generate high-quality text responses (Text Prompting) or create custom visuals (Image Generation) directly on the workspace canvas.
*   **Intelligent Blending (Combine Node):** Merge multiple image and text inputs automatically using advanced AI models to produce state-of-the-art outputs.

---

## 🚀 Installation & Getting Started

Follow these steps to set up and run the application on your local machine:

### Step 1: Clone the Repository
Open your terminal or PowerShell and run the following command to download the codebase:
```bash
git clone https://github.com/thhoang99/antwo-wrokflow.git
cd antwo-wrokflow
```

### Step 2: Install Dependencies
Install all required Node.js packages for both the backend Express engine and Vite frontend:
```bash
npm install
```

### Step 3: Install & Configure the Antigravity CLI (`agy`)
To enable the AI capabilities and automate workflows, you must have the **Antigravity CLI** installed:

1.  Install the CLI on your operating system (refer to the official Antigravity installation documentation).
2.  Open your terminal and authenticate using your **Antigravity 2 account**:
    ```bash
    agy login
    ```
3.  *(Optional)* If the executable is not in your system PATH, configure the absolute path to `agy.exe` inside the **Settings** modal in the Antwo Workflow web application.

### Step 4: Run the Application
Open two separate terminal windows (or run them in the background) and execute:

*   **Start the Backend Server (API & WebSocket Engine):**
    ```bash
    npm run server
    ```
*   **Start the Frontend Dev Server (Vite):**
    ```bash
    npm run dev
    ```

Once running, navigate to the local server address displayed in your terminal (typically `http://localhost:5173`) to build your workflows!

---

## 📄 License

Released under the **[MIT License](LICENSE)**. You are free to use, modify, and distribute this software for personal or commercial projects.

---

## ⚖️ Disclaimer

*   **Independence:** This project is an independent community-driven open-source software application. It is **not affiliated with, associated with, authorized by, endorsed by, or in any way officially connected** with **Google LLC** or any of its subsidiaries or affiliates.
*   **Trademark Acknowledgement:** We fully respect the registered intellectual property and trademarks of all owners:
    *   **"Antigravity"** is a trademark owned by its respective owners.
    *   **"Google"** and **"Gemini"** are registered trademarks of **Google LLC**.
    *   All mentions of these trademarks are purely for technical reference and to describe software compatibility. This usage does not constitute trademark infringement or imply any official partnership.
