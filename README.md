# reddit-monitor

This is a really simple subreddit forwarder built on [NodeJS](https://nodejs.org). It forwards everything submitted to a subreddit to a [Telegram](https://telegram.org/) group.

It grabs the last 20 (default) posts from the subreddit and monitors it every 60 seconds for changes. When a change is detected, it composes and sends a message to the Telegram chat.

## Usage

Make sure you have NodeJS already installed.

1. Copy and rename `config.example.properties` to `config.properties`
2. Edit `config.properties` and enter all the information
3. Via terminal/console, change directories to the app and run `npm install`
4. Run command, `node index.js`

After that, the bot will be running.