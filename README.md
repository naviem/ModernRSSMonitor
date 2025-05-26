<<<<<<< HEAD
=======
@ -1,2 +1,105 @@
# ModernRSSMonitor
>>>>>>> 786de359846d39dc58bdf36d557df774d95dd6b2
# RSS Monitor

## Description

RSS Monitor is a self-hosted application designed to monitor multiple RSS/Atom feeds and send notifications to various services when new articles are detected. It provides a web interface for managing feeds, configuring notification channels (Discord, Telegram, Slack, Email), setting up filters, and previewing feed content.

## Key Features

*   **Multiple Feed Monitoring:** Add and manage several RSS/Atom feeds.
*   **Configurable Scan Intervals:** Set how often each feed should be checked for new content.
*   **Multi-Channel Notifications:**
    *   **Discord:** Send messages with support for rich embeds.
    *   **Telegram:** Send messages via a Telegram Bot.
    *   **Slack:** Send messages via Slack Webhooks.
    *   **Email:** Send email notifications (requires SMTP or a mail service integration - configuration might be manual).
*   **Advanced Filtering:**
    *   Filter articles by keywords in the title or content.
    *   Use regular expressions for complex filtering logic.
    *   Option to match any filter (OR logic) or all filters (AND logic - implied default).
*   **Integration Management:** Save and reuse notification service configurations (e.g., multiple Discord webhooks, Telegram bot tokens).
*   **Live Preview & Testing:**
    *   Detect available fields from an RSS feed.
    *   Preview recent articles from a feed directly in the UI.
    *   Test notification and embed configurations before saving.
*   **Web Interface:** User-friendly interface for all management tasks, built with responsive design.
*   **Persistent Storage:** Feed configurations, notification settings, and application data are stored in an SQLite database.
*   **Real-time UI Updates:** Uses Socket.io for instant feedback on certain actions (e.g., feed updates on the main page).

## Technology Stack

*   **Backend:** Node.js, Express.js
*   **Frontend:** Pug (template engine), Tailwind CSS (likely with DaisyUI components), Vanilla JavaScript
*   **Database:** SQLite
*   **Real-time Communication:** Socket.io
*   **Environment Management:** `dotenv`

## Prerequisites

*   Node.js (v16.x or later recommended)
*   npm (comes with Node.js) or yarn

## Setup and Installation

1.  **Clone the repository:**
    ```bash
    git clone <your-repository-url>
    cd rssmonitor
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    # OR
    # yarn install
    ```

3.  **Set up environment variables:**
    *   Create a `.env` file in the root of the project by copying the example (if you create one):
        ```bash
        cp .env.example .env
        ```
    *   If `.env.example` doesn't exist, create a `.env` file and add the following (adjust values as needed):
        ```env
        PORT=3000
        # DATABASE_PATH=./db/rssmonitor.db (Defaults to this if not set in config.js or similar)
        # LOG_LEVEL=info (e.g., error, warn, info, verbose, debug, silly)
        # SESSION_SECRET=your_strong_session_secret (If using sessions for auth in the future)
        ```
        *Note: Check `config.js` or similar for default values if they are not explicitly required in `.env`.*

4.  **Initialize the database (if needed):**
    The application should create the SQLite database file and its schema automatically on first run if it doesn't exist.

5.  **Run the application:**
    ```bash
    npm start
    # OR
    # node index.js
    ```
    The application should now be running on `http://localhost:PORT` (e.g., `http://localhost:3000`).

## Basic Configuration

Once the application is running:

1.  **Access the Web UI:** Open your browser and go to `http://localhost:PORT`.
2.  **Add Feeds:** Navigate to the section for adding new RSS feeds. You'll typically need the feed title and URL.
3.  **Configure Notification Channels:**
    *   In the "Edit Feed" modal (or a dedicated settings area), you can configure integrations for Discord, Telegram, etc.
    *   For Discord, you'll typically need a Webhook URL.
    *   For Telegram, you'll need a Bot Token and a Chat ID.
4.  **Set Filters:** Use the filter options to control which articles trigger notifications based on title or content.
5.  **Adjust Scan Intervals:** Set how frequently each feed should be checked.

## Available Scripts

In the `package.json`, you might have scripts like:

*   `npm start`: Runs the main application (typically `node index.js`).
*   `npm test`: (If you add tests in the future).
*   `npm run dev`: (If you set up a development server with tools like `nodemon`).

---

<<<<<<< HEAD
_This README provides a general overview. You can expand it with more specific details about API endpoints (if any are public), advanced configuration options, or troubleshooting tips as the project evolves._ 
=======
_This README provides a general overview. You can expand it with more specific details about API endpoints (if any are public), advanced configuration options, or troubleshooting tips as the project evolves._ 
>>>>>>> 786de359846d39dc58bdf36d557df774d95dd6b2
