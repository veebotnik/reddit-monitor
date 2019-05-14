# reddit-monitor

This is a really simple subreddit forwarder built on [NodeJS](https://nodejs.org). It forwards post submitted to a [Discord](https://discordapp.com/) channel.

It grabs the last 20 (default) posts from the subreddit and monitors for new posts every 60 seconds. When a new post is detected, it composes and sends a message to the Discord chat.

## Usage

Make sure you have NodeJS already installed.

1. Copy and rename `config.example.properties` to `config.properties`
2. Edit `config.properties` and enter all the information
3. Via terminal/console, change directories to the app and run `npm install`
4. Run command, `node index.js`

After that, the bot will be running.
