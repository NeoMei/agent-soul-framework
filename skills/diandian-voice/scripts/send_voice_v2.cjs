// 点点的飞书发语音脚本 v2（正确版本）
// 使用方法: node send_voice_v2.js <audio_path> [receive_id]

const lark = require('@larksuiteoapi/node-sdk');
const fs = require('fs');

const client = new lark.Client({
  appId: process.env.FEISHU_APP_ID,
  appSecret: process.env.FEISHU_APP_SECRET,
  appType: lark.AppType.SelfBuild,
  domain: lark.Domain.Feishu,
});

const audioPath = process.argv[2];
const receiveId = process.argv[3] || process.env.FEISHU_USER_OPEN_ID;

async function sendVoice() {
  if (!audioPath || !receiveId) {
    console.log('用法: node send_voice_v2.js <语音路径> [接收者ID]');
    console.log('  或设置环境变量 FEISHU_USER_OPEN_ID');
    process.exit(1);
  }

  // 1. 上传语音文件获取 file_key
  const fileBuffer = fs.readFileSync(audioPath);
  // 检测实际文件类型（2026-05-19 修复：wav声明opus导致采样率错误语速拉长）
  const actualExt = audioPath.split('.').pop().toLowerCase();
  // 飞书支持 opus/ogg/mp3/wav，按实际扩展名映射
  const fileTypeMap = { 'opus': 'opus', 'ogg': 'opus', 'mp3': 'mp3', 'wav': 'wav' };
  const fileType = fileTypeMap[actualExt] || 'opus';
  const fileRes = await client.im.file.create({
    data: { 
      file_type: fileType,
      file_name: audioPath.split('/').pop(),
      file: fileBuffer
    }
  });
  const fileKey = fileRes.file_key;
  console.log('语音上传成功, file_key:', fileKey);

  // 2. 发送语音消息
  const msgRes = await client.im.message.create({
    params: { receive_id_type: 'open_id' },
    data: {
      receive_id: receiveId,
      msg_type: 'audio',
      content: JSON.stringify({ file_key: fileKey })
    }
  });
  console.log('消息发送成功, message_id:', msgRes.data.message_id);
}

sendVoice().catch(console.error);
