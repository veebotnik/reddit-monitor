// add timestamps in front of log messages
require('console-stamp')(console, '[HH:MM:ss.l]');
const merge = require('deepmerge');
const path = require('path');
const prop = require('properties');
const moment = require('moment-timezone');
const redditWrapper = require('reddit-wrapper-v2');
const { TelegramClient } = require('messaging-api-telegram');

const propOptions = {
	path: true,
	namespaces: true
};

let defaultConfig = {
	bot: {
		internal: {
			trackBefore: 20,
			timeZone: 'America/New_York'
		}
	}
};

const setupProperties = () => new Promise((resolve, reject) => {
	prop.parse(path.join(__dirname, 'config.properties'), propOptions, (err, data) => {
		if (!err) {
			data = merge(defaultConfig, data);
	  		resolve(data)
		} else {
			reject(err)
		}
	})
});

let localData = {
	after: null,
	before: [],
	firstRequest: true,
	timeFormat: 'HH:mm:ss ZZ MM/DD/YYYY'
};
const main = (config) => {
	const telegram = TelegramClient.connect(config.telegram.api);
	const reddit = new redditWrapper({
			// Options for Reddit Wrapper
			username: config.reddit.username,
			password: config.reddit.password,
			app_id: config.reddit.app.id,
			api_secret: config.reddit.app.secret,
			user_agent: 'Veebotnik/1.0',
			retry_on_wait: true,
			retry_on_server_error: 5,
			retry_delay: 1,
			logs: false
		});
	let iterationData = {
		limit: config.bot.internal.trackBefore
	};
	if (localData.firstRequest === false) {
		iterationData.before = localData.before.length ? localData.before[0] : null;
	}
	// console.log(localData.before, iterationData);
	reddit.api.get(config.reddit.subreddit + '/new', iterationData)
	// reddit.api.get('/by_id/t3_bkw34o') // removed but not deleted
	// reddit.api.get('/by_id/t3_bkvymb') // normal
	.then(function(response) {
		let responseCode = response[0];
		let responseData = response[1];

		// console.log(responseData.data.children[0].data);
		// return;

		if (responseData.data.children.length) {
			let arrayOfNames = [];
			for (let i = 0; i < responseData.data.children.length; i++) {
				const postData = responseData.data.children[i].data;
				let date = new Date();
				date.setTime(postData.created_utc * 1000);
				postData.created_utc_obj = date;
				arrayOfNames.push(postData.name);
				if (localData.firstRequest === false) {
					let message = '*' + postData.title + '*';
					if (postData.selftext) {
						message += '\n' + postData.selftext
					} else if (postData.url) {
						message += '\n' + postData.url;
					}
					message += '\n\nSubmitted by `' + postData.author + '` at ' + moment(postData.created_utc_obj, localData.timeFormat).tz(config.bot.internal.timeZone).format(localData.timeFormat) + ' via [reddit](https://www.reddit.com' + postData.permalink + ')';
					telegram.sendMessage(config.telegram.chat, message, {
						disable_web_page_preview: false,
						disable_notification: false,
						parse_mode: 'Markdown'
					});
					// console.log(message, postData);
				}
			}
			localData.before.unshift(...arrayOfNames);
			// Don't track more than 20 (default) at a time, to save on memory
			if (localData.before.length > config.bot.internal.trackBefore) {
				localData.before.splice(config.bot.internal.trackBefore);
			}
			localData.firstRequest = false;
			console.log('Tick!');
		} else {
			let detectDeleted = function(beforeId) {
				console.log('Checking post', beforeId, 'to see if it was deleted...');
				reddit.api.get('/by_id/' + beforeId) 
				.then(function(response) {
					let responseCode = response[0];
					let responseData = response[1];
					let postData = responseData.data.children[0].data;

					if ((postData.is_robot_indexable === false && postData.author === '[deleted]') // deleted
						|| (postData.is_robot_indexable === false && postData.is_crosspostable === false)) { // removed by mod/automod
						// is_robot_indexable === false
						// no_follow === true // false on normal & deleted, true on removed
						// is_crosspostable === false
						// either start with no 'before' or use the last known before
						localData.before.shift(); // remove and try again
						console.log('Yes it was deleted! Trying a previous post with new ID', localData.before[0], localData.before);
						if (localData.before.length) {
							detectDeleted(localData.before[0]);
						} else {
							// reject('No more entries to look for');
							// this should mean the next tick should have a null 'before' parameter
						}
					} else {
						// carry on and do nothhing
						console.log(beforeId, 'is fine');
					}
				})
				.catch(function(err) {
					console.log('Reddit Error: ', err);
					reject(err);
				});
			};
			if (localData.before.length) {
				detectDeleted(localData.before[0]);
			} else {
				// ignore it - the next request will not include a before
			}
		}
	})
	.catch(function(err) {
		console.log('Reddit Error: ', err);
		reject(err);
	});
};

setupProperties()
	.then((config) => {
		main(config);
		let intervalRef = setInterval(() => {
			main(config);
		}, 60000);
	})
	.catch(reason => {
		console.error('App error:', reason);
		process.exit(1);
	});
