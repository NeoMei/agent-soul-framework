// 点点的飞书发图片脚本 v2（正确版本）
// 使用方法: node send_image_v2.js <image_path> [receive_id]

const lark = require('@larksuiteoapi/node-sdk');
const fs = require('fs');

const client = new lark.Client({
  appId: process.env.FEISHU_APP_ID,
  appSecret: process.env.FEISHU_APP_SECRET,
  appType: lark.AppType.SelfBuild,
  domain: lark.Domain.Feishu,
});

const imagePath = process.argv[2];
const receiveId = process.argv[3] || process.env.FEISHU_USER_OPEN_ID;

async function sendImage() {
  if (!imagePath || !receiveId) {
    console.log('用法: node send_image_v2.js <图片路径> [接收者ID]');
    console.log('  或设置环境变量 FEISHU_USER_OPEN_ID');
    process.exit(1);
  }

  // 1. 上传图片获取 image_key
  const imageBuffer = fs.readFileSync(imagePath);
  const imageRes = await client.im.image.create({
    data: { 
      image_type: 'message',
      image: imageBuffer
    }
  });
  const imageKey = imageRes.image_key;
  console.log('图片上传成功, image_key:', imageKey);

  // 2. 发送图片消息
  const msgRes = await client.im.message.create({
    params: { receive_id_type: 'open_id' },
    data: {
      receive_id: receiveId,
      msg_type: 'image',
      content: JSON.stringify({ image_key: imageKey })
    }
  });
  console.log('消息发送成功, message_id:', msgRes.data.message_id);
}

sendImage().catch(console.error);
