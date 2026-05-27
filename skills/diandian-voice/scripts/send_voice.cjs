// 点点的飞书发送语音脚本
// 使用方法: node send_voice.cjs <audio_file> [receive_id]

const fs = require('fs');
const path = require('path');
const lark = require('@larksuiteoapi/node-sdk');

const client = new lark.Client({
  appId: process.env.FEISHU_APP_ID,
  appSecret: process.env.FEISHU_APP_SECRET,
  appType: lark.AppType.SelfBuild,
  domain: lark.Domain.Feishu,
});

async function sendVoice(audioPath, receiveId) {
  if (!audioPath || !fs.existsSync(audioPath)) {
    console.error('请提供有效的音频文件路径');
    process.exit(1);
  }

  const fileBuffer = fs.readFileSync(audioPath);
  const fileName = path.basename(audioPath);
  
  // 判断文件格式
  const ext = path.extname(audioPath).toLowerCase();
  let fileType = 'opus';
  if (ext === '.mp3') fileType = 'mp3';
  else if (ext === '.wav') fileType = 'wav';
  
  console.log(`上传语音文件: ${fileName} (${fileType})`);
  
  // 1. 上传文件到飞书 (注意：直接调用then获取file_key)
  const fileRes = await client.im.file.create({
    data: {
      file_type: fileType,
      file_name: fileName,
      file: fileBuffer,
    },
  });

  // 注意：await返回的是直接对象，不是{code, data}结构
  const fileKey = fileRes.file_key;
  
  if (!fileKey) {
    console.error('文件上传失败:', fileRes);
    process.exit(1);
  }
  
  console.log('文件上传成功, file_key:', fileKey);

  // 2. 发送语音消息
  console.log('发送语音消息中...');
  const messageRes = await client.im.message.create({
    params: {
      receive_id_type: 'open_id',
    },
    data: {
      receive_id: receiveId,
      msg_type: 'audio',
      content: JSON.stringify({ file_key: fileKey }),
    },
  });

  if (messageRes.code !== 0) {
    console.error('消息发送失败:', messageRes.msg);
    process.exit(1);
  }

  console.log('✅ 语音消息发送成功! Message ID:', messageRes.data.message_id);
}

// 主函数
const audioPath = process.argv[2];
const receiveId = process.argv[3] || process.env.FEISHU_USER_OPEN_ID;

if (!audioPath || !receiveId) {
  console.log('用法: node send_voice.cjs <audio_file> [receive_id]');
  console.log('  或设置环境变量 FEISHU_USER_OPEN_ID');
  process.exit(1);
}

sendVoice(audioPath, receiveId).catch(console.error);
