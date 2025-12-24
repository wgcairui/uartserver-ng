/**
 * Drop legacy `user_1` index from users collection
 *
 * This script removes the legacy unique index on the `user` field
 * which is causing duplicate key errors in tests.
 */

import { mongodb } from '../src/database/mongodb';

async function dropLegacyIndex() {
  try {
    console.log('Connecting to MongoDB...');
    await mongodb.connect();

    const db = mongodb.getDatabase();
    const usersCollection = db.collection('users');

    console.log('Dropping legacy user_1 index...');

    try {
      await usersCollection.dropIndex('user_1');
      console.log('✅ Successfully dropped user_1 index');
    } catch (error: any) {
      if (error.code === 27 || error.message?.includes('index not found')) {
        console.log('ℹ️  Index user_1 does not exist (already dropped)');
      } else {
        throw error;
      }
    }

    console.log('\nCurrent indexes:');
    const indexes = await usersCollection.indexes();
    indexes.forEach((index) => {
      console.log(`  - ${index.name}: ${JSON.stringify(index.key)}`);
    });

    await mongodb.disconnect();
    console.log('\nDone!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

dropLegacyIndex();
