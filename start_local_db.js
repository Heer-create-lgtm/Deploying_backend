const { MongoMemoryServer } = require('mongodb-memory-server');

(async () => {
    try {
        // Create an instance, aiming for default port if possible, or just start it
        const mongod = await MongoMemoryServer.create({
            instance: {
                port: 27017 // Try to bind to standard port
            }
        });

        const uri = mongod.getUri();
        console.log(`MongoMemoryServer started on: ${uri}`);
        console.log('Keep this process running to maintain the database.');

        // Keep alive
        process.on('SIGINT', async () => {
            await mongod.stop();
            process.exit(0);
        });
    } catch (err) {
        console.error('Failed to start MongoMemoryServer:', err);
        // Fallback without fixed port
        try {
            const mongod = await MongoMemoryServer.create();
            console.log(`MongoMemoryServer started on (fallback): ${mongod.getUri()}`);
            console.log('UPDATE YOUR .env TO USE THIS URI!');
        } catch (err2) {
            console.error('Totally failed:', err2);
        }
    }
})();
