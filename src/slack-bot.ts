import { App } from '@slack/bolt';
import { Low, JSONFile } from '@commonify/lowdb';
import { GameServer } from './game-server';
import hhmmss from './lib/hhmmss';

const DATA_PATH = process.env.DATA_PATH || './data/';
const DBG = Boolean(Number(process.env.DBG));

interface SlackData {
    channelId: string;
    host: string;
    port: number;
    messageId: string;
}

const adapter = new JSONFile<SlackData[]>(DATA_PATH + 'slack.json');
const db = new Low<SlackData[]>(adapter);

const serverInfoMessages: ServerInfoMessage[] = [];

let bot: App;
export async function init(token: string, appToken: string) {
    if (!bot) {
        console.log('slack-bot starting...');
        bot = new App({
            token,
            appToken,
            socketMode: true
        });

        if (DBG) {
            bot.message('ping', async ({ message, say }) => {
                // Handle only newly posted messages here
                if (message.subtype === undefined
                    || message.subtype === 'bot_message'
                    || message.subtype === 'file_share'
                    || message.subtype === 'thread_broadcast') {
                    await say(`<@${message.user}> pong`);
                }
            });
        }

        await bot.start();
    }

    serverInfoMessages.length = 0;
    await db.read();
    db.data = db.data || [];
}

export async function serverUpdate(gs: GameServer) {
    if (DBG) console.log('slack.serverUpdate', gs.config.host, gs.config.port, gs.config.slack);

    if (gs.config.slack) {
        for (const ch of gs.config.slack) {
            try {
                let m = await getServerInfoMessage(ch.channelId, gs.config.host, gs.config.port);
                await m.updatePost(gs);
            } catch (e: any) {
                console.error(['slack-bot.sup', ch.channelId, gs.config.host, gs.config.port].join(':'), e.message || e);
            }
        }
    }
}

async function getServerInfoMessage(cid: string, host: string, port: number) {
    let m = serverInfoMessages.find(n => {
        return n.channelId === cid && n.host === host && n.port === port;
    });

    if (!m) {
        m = new ServerInfoMessage(cid, host, port);

        let msgId;
        if (db.data) {
            const md = db.data.find(d => {
                return d.channelId === cid && d.host === host && d.port === port;
            });
            if (md) msgId = md.messageId;
        }

        await m.init(msgId);

        serverInfoMessages.push(m);
    }

    return m;
}

class ServerInfoMessage {
    public channelId: string;
    public host: string;
    public port: number;
    public messageId: string = '0';

    constructor(channelId: string, host: string, port: number) {
        this.channelId = channelId;
        this.host = host;
        this.port = port;
    }

    async init(msgId?: string) {
        if (msgId) this.messageId = msgId;
        else {
            const message = await bot.client.chat.postMessage({
                channel: this.channelId,
                text: 'Initializing server info...'
            });

            if (message.ok && message.ts) {
                this.messageId = message.ts;
            } else {
                console.error(['slack.init.msg', this.channelId, this.host, this.port].join(':'));
            }
        }

        if (db.data && this.messageId) {
            const mi = db.data.findIndex(d => {
                return d.channelId === this.channelId && d.host === this.host && d.port === this.port;
            });

            if (mi === -1 || mi === undefined) {
                db.data.push({
                    channelId: this.channelId,
                    host: this.host,
                    port: this.port,
                    messageId: this.messageId
                });
            } else db.data[mi].messageId = this.messageId;

            try {
                await db.write();
            } catch (e: any) {
                console.error(['slack.init.db', this.channelId, this.host, this.port].join(':'), e.message || e);
            }
        }
    }

    async updatePost(gs: GameServer) {
        // const embed = new EmbedBuilder();
        // const fields: APIEmbedField[] = [];
        // embed.setFooter({ text: 'Last updated' });
        // embed.setTimestamp();
        // embed.setImage(gs.history.statsChart());

        let text = this.escapeMarkdown(gs.niceName) + ' offline...';

        if (gs.info && gs.online) {
            text = this.escapeMarkdown(gs.niceName) + ' online! game:' + gs.info.game + ' map:' + gs.info.map + ' players:' + gs.info.players.length;
        //     embed.setTitle(gs.niceName.slice(0, 256));
        //     embed.setColor('#000000');

        //     if (gs.info.game) fields.push({ name: 'Game', value: String(gs.info.game), inline: true });
        //     if (gs.info.map) fields.push({ name: 'Map', value: String(gs.info.map), inline: true });
        //     fields.push({ name: 'Players', value: gs.info.playersNum + '/' + gs.info.playersMax, inline: true });
        //     fields.push({ name: 'Connect', value: 'steam://connect/' + gs.info.connect });

        //     if (gs.info?.players.length > 0) {
        //         const pNames: string[] = [];
        //         const pTimes: string[] = [];
        //         const pScores: string[] = [];
        //         const pPings: string[] = [];

        //         for (const p of gs.info?.players) {
        //             if (pNames.join('\n').length > 1016
        //                 || pTimes.join('\n').length > 1016
        //                 || pScores.join('\n').length > 1016
        //                 || pPings.join('\n').length > 1016) {
        //                 if (pNames.length) pNames.pop();
        //                 if (pTimes.length) pTimes.pop();
        //                 if (pScores.length) pScores.pop();
        //                 if (pPings.length) pPings.pop();
        //                 break;
        //             }

        //             if (p.get('name') !== undefined) pNames.push(p.get('name') || 'n/a');
        //             if (p.get('time') !== undefined) pTimes.push(hhmmss(p.get('time') || 0));
        //             if (p.get('score') !== undefined) pScores.push(p.get('score') || '0');
        //             if (p.get('ping') !== undefined) pPings.push(String(p.get('ping') || 0) + ' ms');
        //         }

        //         if (pNames.length) fields.push({ name: 'Name', value: '```\n' + pNames.join('\n').slice(0, 1016) + '\n```', inline: true });
        //         if (pTimes.length) fields.push({ name: 'Time', value: '```\n' + pTimes.join('\n').slice(0, 1016) + '\n```', inline: true });
        //         if (pScores.length) fields.push({ name: 'Score', value: '```\n' + pScores.join('\n').slice(0, 1016) + '\n```', inline: true });
        //         if (pPings.length) fields.push({ name: 'Ping', value: '```\n' + pPings.join('\n').slice(0, 1016) + '\n```', inline: true });
        //     }
        } else {
        //     embed.setTitle(gs.niceName.slice(0, 245) + ' offline...');
        //     embed.setColor('#ff0000');
        }

        // embed.setFields(fields);

        try {
            await bot.client.chat.update({
                as_user: true,
                channel: this.channelId,
                ts: this.messageId,
                text
            });
        } catch (e: any) {
            console.error(['slack.up', this.channelId, this.host, this.port].join(':'), e.message || e);
        }
    }

    escapeMarkdown(str: string): string {
        const patterns = [
            /_/g,
            /~/g,
            /`/g,
            /</g,
            />/g
        ];

        return patterns.reduce((acc: string, pattern: RegExp) => acc.replace(pattern, '\\$&'), str);
    }
}