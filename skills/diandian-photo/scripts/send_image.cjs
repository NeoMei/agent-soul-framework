// 点点的飞书发图片脚本
// 使用方法: node send_image.js <image_path>

const fs = require('fs');
const lark = require('@larksuiteoapi/node-sdk');

const client = new lark.Client({
  appId: process.env.FEISHU_APP_ID || 'cli_a9298a2012b8dcc7',
  appSecret: process.env.FEISHU_APP_SECRET,
  appType: lark.AppType.SelfBuild,
  domain: lark.Domain.Feishu,
});

async function sendImage(imagePath, receiveId) {
  const fileBuffer = fs.readFileSync(imagePath);
  const fileRes = await client.im.image.create({
    data: { image_type: 'message', image: fileBuffer },
  });
  const imageKey = fileRes.image_key;
  
  await client.im.message.create({
    params: { receive_id_type: 'open_id' },
    data: {
      receive_id: receiveId,
      msg_type: 'image',
      content: JSON.stringify({ image_key: imageKey }),
    },
  });
  
  console.log('发送成功!');
}

const imagePath = process.argv[2];
const receiveId = process.argv[3] || process.env.FEISHU_USER_OPEN_ID;

if (!imagePath || !receiveId) {
  console.log('用法: node send_image.js <image_path> [receive_id]');
  console.log('  或设置环境变量 FEISHU_USER_OPEN_ID');
  process.exit(1);
}

sendImage(imagePath, receiveId).catch(console.error);
