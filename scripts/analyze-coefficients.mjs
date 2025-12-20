import { MongoClient } from 'mongodb';

const uri = 'mongodb://localhost:27017';
const client = new MongoClient(uri);

async function analyzeCoefficients() {
  try {
    await client.connect();
    const db = client.db('UartServer_analysis');
    const collection = db.collection('device.protocols');

    // 1. 统计协议总数
    const totalProtocols = await collection.countDocuments();
    console.log(`\n📊 协议总数: ${totalProtocols}`);

    // 2. 查看一个协议示例结构
    const sampleProtocol = await collection.findOne();
    console.log('\n📄 协议示例结构:');
    if (sampleProtocol?.instruct?.[0]?.formResize?.[0]) {
      console.log('formResize 字段示例:', JSON.stringify(sampleProtocol.instruct[0].formResize[0], null, 2));
    }

    // 3. 统计使用函数表达式的字段
    const protocolsWithExpression = await collection.aggregate([
      { $unwind: '$instruct' },
      { $unwind: '$instruct.formResize' },
      {
        $match: {
          $or: [
            { 'instruct.formResize.bl': { $regex: /\(/ } },
            { 'instruct.formResize.bl': { $regex: /,/ } }
          ]
        }
      },
      {
        $group: {
          _id: '$Protocol',
          expressionFields: {
            $addToSet: {
              name: '$instruct.formResize.name',
              bl: '$instruct.formResize.bl',
              instructName: '$instruct.name'
            }
          }
        }
      }
    ]).toArray();

    console.log(`\n🔍 使用函数表达式的协议数: ${protocolsWithExpression.length}`);

    // 4. 统计所有 bl 字段的不同类型
    const allBlFields = await collection.aggregate([
      { $unwind: '$instruct' },
      { $unwind: '$instruct.formResize' },
      { $match: { 'instruct.formResize.bl': { $exists: true, $ne: '' } } },
      {
        $group: {
          _id: '$instruct.formResize.bl',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 50 }
    ]).toArray();

    console.log(`\n📈 系数字段类型分布 (前50):`);
    console.log('类型 | 数量');
    console.log('-----|-----');

    const expressionCount = allBlFields.filter(item => item._id?.includes('(') || item._id?.includes(',')).length;
    const numericCount = allBlFields.filter(item => !isNaN(Number(item._id))).length;

    allBlFields.forEach(item => {
      const isExpression = item._id?.includes('(') || item._id?.includes(',');
      const marker = isExpression ? '🔴' : '✅';
      console.log(`${marker} ${item._id} | ${item.count}`);
    });

    // 5. 详细列出使用函数表达式的协议
    if (protocolsWithExpression.length > 0) {
      console.log(`\n\n📋 使用函数表达式的协议详情:\n`);
      protocolsWithExpression.forEach((proto, index) => {
        console.log(`${index + 1}. 协议: ${proto._id}`);
        proto.expressionFields.forEach(field => {
          console.log(`   - ${field.instructName} > ${field.name}: "${field.bl}"`);
        });
        console.log('');
      });
    }

    // 6. 分类统计
    const totalBlFields = allBlFields.reduce((sum, item) => sum + item.count, 0);
    const expressionFields = allBlFields
      .filter(item => item._id?.includes('(') || item._id?.includes(','))
      .reduce((sum, item) => sum + item.count, 0);

    console.log('\n\n📊 统计摘要:');
    console.log('════════════════════════════════════════');
    console.log(`协议总数:              ${totalProtocols}`);
    console.log(`使用函数表达式的协议:  ${protocolsWithExpression.length}`);
    console.log(`使用比例:              ${((protocolsWithExpression.length / totalProtocols) * 100).toFixed(2)}%`);
    console.log('');
    console.log(`总字段数:              ${totalBlFields}`);
    console.log(`函数表达式字段:        ${expressionFields}`);
    console.log(`字段使用比例:          ${((expressionFields / totalBlFields) * 100).toFixed(2)}%`);
    console.log('════════════════════════════════════════');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}

analyzeCoefficients();
