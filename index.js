// add timestamps in front of log messages
require('console-stamp')(console, '[HH:MM:ss.l]');
const merge = require('deepmerge');
const path = require('path');
const prop = require('properties');
const moment = require('moment-timezone');
const redditWrapper = require('reddit-wrapper-v2');
const { TelegramClient } = require('messaging-api-telegram');

const Discord = require('discord.js');
const discordClient = new Discord.Client();

let discordBroadcastChannels = [];

const propOptions = {
	path: true,
	namespaces: true
};

let defaultConfig = {
	bot: {
		internal: {
			reddit: {
				trackBefore: 20,
				poll: 60
			},
			timeZone: 'America/New_York',
			timeFormat: 'HH:mm:ss ZZ MM/DD/YYYY',
		}
	}
};

const setupProperties = () => new Promise((resolve, reject) => {
	prop.parse(path.join(__dirname, 'config.properties'), propOptions, (err, data) => {
		if (!err) {
			data = merge(defaultConfig, data);
			if (data.reddit.suspicious) {
				if (data.reddit.suspicious.authors) {
					data.reddit.suspicious.authors = data.reddit.suspicious.authors.split(/\s*,\s*/);
				}
				if (data.reddit.suspicious.flair) {
					data.reddit.suspicious.flair = data.reddit.suspicious.flair.split(/\s*,\s*/);
				}
			}
	  		resolve(data)
		} else {
			reject(err)
		}
	})
});

const setupServices = (config) => new Promise((resolve, reject) => {
	try {
		const telegram = (config.telegram.api ? TelegramClient.connect(config.telegram.api) : false);
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
		discordClient.login(config.discord.token);
		discordClient.on('ready', () => {
		  console.log(`Logged into Discord as ${discordClient.user.tag}!`);
		  for (let key of discordClient.channels) {
				if (key[1].type === 'text' && (
					key[1].name.toLowerCase().indexOf(config.discord.notifyChannel) > -1)) {
					discordBroadcastChannels.push(key);
				}
			}
		});
		discordClient.on('message', message => {
			if (message.content === '!last') {
				if (localData.lastSuspiciousTime && localData.lastSuspiciousPermalink) {
					const now = moment(new Date()); //todays date
					const end = moment(localData.lastSuspiciousTime); // another date

					const days = now.diff(end, 'days');
					let hours = now.diff(end, 'hours');
					let minutes = now.diff(end, 'minutes');
					let seconds = now.diff(end, 'seconds');
					if (minutes) {
						seconds -= minutes * 60;
					}
					if (hours) {
						minutes -= hours * 60;
					}
					if (days) {
						hours -= 24 * days;
					}

					let diffMessage = (days ? days + ' days, ' : '');
					diffMessage += (hours ? hours + ' hours, ' : '');
					diffMessage += (minutes ? minutes + ' minutes and ' : '');
					diffMessage += (seconds ? seconds + ' seconds' : '');
					message.reply('the last HOT was ' + diffMessage + ' ago: ' + localData.lastSuspiciousPermalink);
				} else {
					message.reply('my records are empty :(');
				}
			}
			if (message.content === '!about') {
				message.reply('check out my source code! https://github.com/veebotnik/reddit-monitor');
			}
		})
		const services = {
			telegram: telegram,
			reddit: reddit,
			discord: discordClient
		};
		resolve({services: services, config: config});
	} catch (e) {
		reject(e);
	}
});

let firstRequest = true; // global bot session internal - not persistent

let localData = {
	after: null,
	before: [],
	lastSuspiciousTime: null,
	lastSuspiciousPermalink: null
};

const main = (resource) => {
	let iterationData = {
		limit: resource.config.bot.internal.reddit.trackBefore
	};
	if (firstRequest === false) {
		iterationData.before = localData.before.length ? localData.before[0] : null;
	}
	// console.log(localData.before, iterationData);
	resource.services.reddit.api.get(resource.config.reddit.subreddit + '/new', iterationData)
	// reddit.api.get('/by_id/t3_bkw34o') // removed but not deleted
	// reddit.api.get('/by_id/t3_bkvymb') // normal
	// reddit.api.get('/by_id/t3_bmjxpr') // normal with flair
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
				if (firstRequest === false) {
					const flair = postData.author_flair_text;
					const flairRegexCheck = new RegExp(resource.config.reddit.suspicious.flair.join('|'));
					const suspiciousFlairPresent = (flair && flair.match(flairRegexCheck) === null ? false : true);
					if ((flair && suspiciousFlairPresent)
						|| resource.config.reddit.suspicious.authors.indexOf(postData.author) > -1) {
						localData.lastSuspiciousTime = postData.created_utc_obj;
						localData.lastSuspiciousPermalink = 'https://www.reddit.com' + postData.permalink;
					}
					if (discordBroadcastChannels.length) {
						const newPostRichEmbed = new Discord.RichEmbed()
							.setTitle(postData.title)
							.setURL('https://www.reddit.com' + postData.permalink)
							.setAuthor('u/' + postData.author + (flair ? ' (' + flair + ')' : ''), 'https://b.thumbs.redditmedia.com/aRUO-zIbXgMTDVJOcxKjY8P6rGkakMdyVXn4k1VN-Mk.png', 'https://www.reddit.com/u/' + postData.author)
							.setDescription(postData.selfText ? postData.selfText : postData.url)
							.setImage(postData.url)
							.setTimestamp()
							.setFooter('Submitted by u/' + postData.author + ' ' + (flair ? '(' + flair + ')' + ' ' : '') + 'at ' + moment(postData.created_utc_obj, resource.config.bot.internal.timeFormat).tz(resource.config.bot.internal.timeZone).format(resource.config.bot.internal.timeFormat));
						for (let j = discordBroadcastChannels.length - 1; j >= 0; j--) {
							discordBroadcastChannels[j][1].send(newPostRichEmbed)
								.then((message) => {
									if (flair) {
										message.react('🏢');
										if (suspiciousFlairPresent) {
											message.react('🔥');
											discordBroadcastChannels[j][1].send('HOT @everyone :point_up_2: https://www.reddit.com' + postData.permalink);
										}
									}
									if (resource.config.reddit.suspicious.authors.indexOf(postData.author) > -1) {
										message.react('⚠');
										discordBroadcastChannels[j][1].send(':warning: HOT POTENTIAL @everyone :point_up_2: https://www.reddit.com' + postData.permalink + '\nKnown HOT user posted');
									}
								});
						}
						if (resource.services.telegram) {
							if ((flair && suspiciousFlairPresent)
								|| resource.config.reddit.suspicious.authors.indexOf(postData.author) > -1) {
								let message = '*' + postData.title + '*';
								if (postData.selftext) {
									message += '\n' + postData.selftext
								} else if (postData.url) {
									message += '\n' + postData.url;
								}
								message += '\n\nSubmitted by `' + 'u/' + postData.author + '` ' + (flair ? '_' + flair + '_' + ' ' : '') + 'at ' + moment(postData.created_utc_obj, resource.config.bot.internal.timeFormat).tz(resource.config.bot.internal.timeZone).format(resource.config.bot.internal.timeFormat) + ' via [reddit](https://www.reddit.com' + postData.permalink + ')';
								resource.services.telegram.sendMessage(resource.config.telegram.chat, message, {
									disable_web_page_preview: false,
									disable_notification: false,
									parse_mode: 'Markdown'
								});
							}
						}
					}
				}
			}
			localData.before.unshift(...arrayOfNames);
			// Don't track more than 20 (default) at a time, to save on memory
			if (localData.before.length > resource.config.bot.internal.reddit.trackBefore) {
				localData.before.splice(resource.config.bot.internal.reddit.trackBefore);
			}
			firstRequest = false;
			console.log('Tick!');
		} else {
			let detectDeleted = function(beforeId) {
				console.log('Checking post', beforeId, 'to see if it was deleted...');
				resource.services.reddit.api.get('/by_id/' + beforeId) 
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
							detectDeleted(localData.before[0]);// recurse 
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
	.then(setupServices)
	.then((resource) => {
		main(resource);
		const pollInterval = parseInt(resource.config.bot.internal.reddit.poll) * 1000;
		let intervalRef = setInterval(() => {
			main(resource);
		}, pollInterval);
	})
	.catch(reason => {
		console.error('App error:', reason);
		process.exit(1);
	});
