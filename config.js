/**
 * CosmosDB NodeJs SDK tryout
 * The purpose is to demo, what is really working and which is not
 *
 * author : ari.kekalainen@gmail.com
 *
 * File: config.js - Configuration
 */

const config = {};

/**
 * Use CosmosDb emulator instead of real Azure CosmosDB service
 */
const useEmulator = true;

/**
 * CosmosDB emulator configuration
 * Ref : https://docs.microsoft.com/en-us/azure/cosmos-db/local-emulator
 * Using default cosmosDb emulator authKey and host
 */
if (useEmulator) {
    config.host = process.env.HOST || "https://localhost:8081/";
    config.authKey = process.env.AUTH_KEY || "C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==";

}
 /**
 *  CosmosDB configuration
 */
if (!useEmulator) {
    config.host = process.env.HOST || "insert azure the cosmos db account url";
    config.authKey = process.env.AUTH_KEY || "insert the master key";
}
/**
 * Database id and collection id
 */
config.databaseId = "ToDoList";
config.collectionId = "Items";

/**
 * Partitions
 */
config.partitionA = "partA";
config.partitionB = "partB";
config.partitionKey = "partition";

/**
 * User
 */
config.testuser = "testuser";

/**
 * Stored procedure id for testing
 */
config.testSprocId = "getAllDocs";

module.exports = config;