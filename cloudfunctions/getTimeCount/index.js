exports.main = async (event, context) => {
    console.log('云函数更新数据库:', JSON.stringify(event) )

    return {
            success: true,
            pic_text_total_time: 48 * 60 * 60,
            pic_text_video_size: 30 * 1024 * 1024,
            pic_text_video_time: 3 * 60,
            msg: '缺少音频ID或分享者ID',
          };
};