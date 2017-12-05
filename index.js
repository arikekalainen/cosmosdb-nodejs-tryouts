/**
 * CosmosDB NodeJs SDK tryout
 * The purpose is to demo which is really working and which is not
 *
 * author : ari.kekalainen@gmail.com
 *
 * pre-requisites:
 * - Install NodeJs (4.x => )
 * - Create CosmosDb Account or use CosmosDb emulator
 * - Create Database (id = config.databaseId)
 * - Create Collection (id = config.collectionId)
 *   -- Size: unlimited
 *   -- PartitionKey: /partition (= config.partitionKey)
 * - Get authKey and store it to config.authKey
 * - Get host and store it to config.host
 *
 * Executing:
 * - npm install
 * WITH Real CosmosDb account
 * - node index.js
 * WITH CosmosDB emulator
 * - set NODE_TLS_REJECT_UNAUTHORIZED=0&& node index.js
 *
 */

"use strict";

const DocumentDBClient = require("documentdb").DocumentClient;
const HashPartitionResolver = require('documentdb').HashPartitionResolver;
const config = require("./config");
const Q = require("q");
const _ = require("lodash");

/**
 * DocumentDb client using master key
 */
const masterDbClient  = new DocumentDBClient(config.host, {
    masterKey: config.authKey
});


/**
 * Generate some test documents
 * @param {DocumentDBClient} dbClient
 * @param {string} collLink
 * @param {string} partitionKey
 */

const generateTestDocs = (dbClient, collLink, partitionKey) => {
    // 10 promises => 10 documents
    const promises = new Array(10).fill(Q.defer());

    // execute createDocument
    promises.map((promise) => {
        createDocument({data: "a", info: "b"}, dbClient, collLink, partitionKey)
            .then(res => promise.resolve(res))
            .catch(err => promise.reject(err))
    });

    return Q.all(promises);
};

/**
 * Create document to database
 * @param {any, object} document
 * @param {DocumentDBClient} dbClient
 * @param {string} collLink
 * @param {string} partition
 * @returns {*}
 */
const createDocument = (document, dbClient, collLink, partition) => {
    const deferred = Q.defer();
    // Add partitionKey with partitionKey value
    document[config.partitionKey] = partition;
    dbClient.createDocument(collLink, document, {partitionKey: partition}, (err, results) => {
        if (err) deferred.reject(err);
        else deferred.resolve(results);
    });
    return deferred.promise;
};

/**
 * Delete document
 * @param {DocumentDBClient} dbClient
 * @param {string} documentLink
 * @returns {*}
 */
const deleteDocument = (dbClient, dbId, collId, documentId, partition) => {
    const deferred = Q.defer();
    // NOTE! somehow the self links does not work here, so we must use Ids
    const docPath = "dbs/" + dbId + "/colls/" + collId + "/docs/" + documentId;

    // THERE MUST BE A PARTITION, Will not work without partition.
    dbClient.deleteDocument(docPath, { partitionKey: partition }, (err, results) => {
        if (err) deferred.reject(err);
        else deferred.resolve(results);
    });
    return deferred.promise;
};

/**
 * Delete all documents: note from all partitions (TEST USAGE)
 * @param {DocumentDBClient} dbClient
 * @param {string} dbId
 * @param {Collection} coll
 * @returns {*}
 */
const deleteAllDocuments = (dbClient, dbId, coll) => {
    const deferred = Q.defer();
    queryDocuments(dbClient, coll._self)
        .then((docs) => {
            console.log("--- " + docs.length + " to be deleted");
            const promises = new Array(docs.length).fill(Q.defer());
            promises.forEach((deferred, index) => {
                deleteDocument(dbClient, dbId, coll.id, docs[index].id, docs[index].partition)
                    .then(() => deferred.resolve(true))
                    .catch((err) => deferred.reject(err))
            })
        })
        .catch((err) => {
            deferred.reject(err);
        })
    return deferred.promise;
};

/**
 * Stored procedure for testing (note ES5 JS)
 * Query all documents and return them
 * - use createStoredProc for creating sproc to CosmosDb
 * - use executeDocsSProc for executing
 */
const StoredProcGetDocs = {
    id: config.testSprocId,
    serverScript:
        function sample(partitionKey) {
            var collection = getContext().getCollection();

            // Query documents and take 1st item.
            var isAccepted = collection.queryDocuments(
                collection.getSelfLink(),
                'SELECT * FROM root r',
                {partitionKey: partitionKey},
                function (err, feed, options) {
                    if (err) throw err;

                    // Check the feed and if empty, set the body to 'no docs found', 
                    if (!feed || !feed.length) {
                        var response = getContext().getResponse();
                        response.setBody('no docs found');
                    }
                    else {
                        var response = getContext().getResponse();
                        var body = { partitionKey: partitionKey, docs: feed };
                        response.setBody(JSON.stringify(body));
                    }
                });

            if (!isAccepted) throw new Error('The query was not accepted by the server.');
        }
};

/**
 * Create Stored procedure
 * @param {string} dbId Database Id
 * @param {string} collId Collection Id
 * @returns {Q.Promise<any>}
 */
const createStoredProc = (dbId, collId, storedProc) => {
    const deferred = Q.defer();
    // Collection path
    // NOTE! somehow the self links does not work here, so we must use Ids
    const collectionPath = "dbs/" + dbId + "/colls/" + collId;
    masterDbClient.createStoredProcedure(collectionPath, storedProc, {}, (err, results) => {
        if (err) deferred.reject(err);
        else deferred.resolve(results[0]);
    });
    return deferred.promise;
};

/**
 * Delete Stored procedure
 * @param {string} dbId Database Id
 * @param {string} collId Collection Id
 * @param {string} storedProcId Stored Procedure Id
 * @returns {Q.Promise<any>}
 */
const deleteStoredProc = (dbId, collId, storedProcId) => {
    const deferred = Q.defer();
    // StoredProcedure path
    // NOTE! somehow the self links does not work here, so we must use Ids
    const sprocPath = "dbs/" + dbId + "/colls/" + collId + "/sprocs/" + storedProcId;
    masterDbClient.deleteStoredProcedure(sprocPath, {}, (err, results) => {
        if (err) deferred.reject(err);
        else deferred.resolve(true);
    });
    return deferred.promise;
};

/**
 * Get database
 * @param {string} dbId DatabaseId
 * @returns {Q.Promise<Db>} Database object
 */
const getDatabase = (dbId) => {
    const deferred = Q.defer();
    const querySpec = {
        query: 'SELECT * FROM root r WHERE r.id = @id',
        parameters: [{
            name: '@id',
            value: dbId
        }]
    };
    masterDbClient.queryDatabases(querySpec, { maxItemCount: 1 } ).toArray((err, results) => {
        if (err) deferred.reject(err);
        else deferred.resolve(results[0]);
    });
    return deferred.promise;
};

/**
 * Get Collection
 * @param {string} dbLink
 * @param {string} collId
 * @returns {Q.Promise<Collection>} Collection object
 */
const getCollection = (dbLink, collId) => {
    const deferred = Q.defer();
    const querySpec = {
        query: 'SELECT * FROM colls c WHERE c.id = @id',
        parameters: [{
            name: '@id',
            value: collId
        }]
    };
    masterDbClient.queryCollections(dbLink, querySpec, { maxItemCount: 1 } ).toArray((err, results) => {
        if (err) deferred.reject(err);
        else deferred.resolve(results[0]);
    });
    return deferred.promise;
};

/**
 * Execute Stored Procedure
 * @param {DocumentDBClient} dbClient
 * @param {string} dbId
 * @param {string} collId
 * @param {string} partitionKey
 * @param {string} sprocId
 * @returns {*}
 */
const executeDocsSProc = (dbClient, dbId, collId, partitionKey, sprocId) => {
    const deferred = Q.defer();
    const sprocLink = "dbs/" + dbId + "/colls/" + collId + "/sprocs/" + sprocId;
    dbClient.executeStoredProcedure(sprocLink, [partitionKey], { partitionKey: partitionKey }, (err, results) => {
        if (err) deferred.reject(err);
        else deferred.resolve(results);
    });
    return deferred.promise;
};

/**
 * Exexcute Stored Procedure (TEST, TRYOUT, ETC... version)
 * @param {DocumentDBClient} dbClient
 * @param {string} dbId
 * @param {string} collId
 * @param {string} partitionKey
 * @param {string} sprocId
 * @returns {*|PromiseLike<any>}
 */
const executeDocsSProcTest = (dbClient, dbId, collId, partitionKey, sprocId) => {
    const deferred = Q.defer();
    const sprocLink = "dbs/" + dbId + "/colls/" + collId + "/sprocs/" + sprocId;
    dbClient.executeStoredProcedure(sprocLink, [partitionKey], { partitionKey: partitionKey }, (err, results) => {
        if (err) deferred.reject(err);
        else deferred.resolve(results);
    });
    return deferred.promise;
};

/**
 * Create DocumentDB User Client with permissions
 * @param {string} dbLink 
 * @param {string} userId
 * @returns {*|PromiseLike<any>}
 */
const createUserClient = (dbLink, userId) => {
    const deferred = Q.defer();
    const querySpec = {
        query: 'SELECT * FROM Users r WHERE r.id = @id',
        parameters: [{
            name: '@id',
            value: userId
        }]
    };
    masterDbClient.queryUsers(dbLink, querySpec, {}).toArray((err, results) => {
        if (err) deferred.reject(err);
        else {
            getUserPermissions(results[0]._self)
                .then((permissions) => {
                    // DEBUG PRINT
                    // console.log("Users permissions: ", permissions);
                    const resourceTokens = [];

                    permissions.forEach((permission) => {
                        resourceTokens.push(permission._token);
                    });

                    deferred.resolve(new DocumentDBClient(config.host, {
                        // resourceTokens: resourceTokens (THIS DOES NOT WORK!)
                        permissionFeed: permissions
                    }));
                })
                .catch((err) => {
                    deferred.reject(err);
                });
        }
    });
    return deferred.promise;
};

/**
 * Create Hash resolver for partitioned collections
 * @param {DocumentDBClient} dbClient Document db client
 * @param {string} dbLink Database self link
 * @param {Collection[]} collections Array of collections
 */
const createHashPartitionResolver = (dbClient, dbLink, collections) => {
    const deferred = Q.defer();
    // Array of collectionLinks
    const collLinks = [];
    collections.forEach((collection) => {
        collLinks.push(collection._self)
    });
    // Create resolver and and it to database
    try {
        const resolver = new HashPartitionResolver((doc) => {return doc[config.partitionKey]; }, collLinks);
        dbClient.partitionResolvers[dbLink] = resolver;
        deferred.resolve(resolver);
    } catch (e) {
        deferred.reject(e);
    }
    return deferred.promise;
};

/**
 * Get user
 * @param {string} dbLink
 * @param {string} userId
 * @returns {*|PromiseLike<any>}
 */
const getUser = (dbLink, userId) => {
    const deferred = Q.defer();
    const querySpec = {
        query: 'SELECT * FROM Users r WHERE r.id = @id',
        parameters: [{
            name: '@id',
            value: userId
        }]
    };
    masterDbClient.queryUsers(dbLink, querySpec, {}).toArray((err, results) => {
        if (err) deferred.reject(err);
        else deferred.resolve(results[0]);
    });
    return deferred.promise;
};

/**
 * GEt user's permissions
 * @param {string} userLink
 * @returns {*|PromiseLike<any>}
 */
const getUserPermissions = (userLink) => {
    const deferred = Q.defer();
    masterDbClient.queryPermissions(userLink, "SELECT * FROM permissions", {}).toArray((err, results) => {
        if (err) deferred.reject(err);
        else deferred.resolve(results);
    });
    return deferred.promise;
};

/**
 * Create database user
 * @param {string} dbLink
 * @param {string} userId
 * @returns {*|PromiseLike<any>}
 */
const createUser = (dbLink, userId) => {
    const deferred = Q.defer();
    masterDbClient.createUser(dbLink, {id: userId}, (err, results) => {
        if (err) deferred.reject(err);
        else deferred.resolve(results);
    });
    return deferred.promise;
};

/**
 * Delete database user 
 * @param {string} dbLink
 * @param {string} userId
 * @returns {*|PromiseLike<any>}
 */
const deleteUser = (dbLink, userId) => {
    const deferred = Q.defer();
    getUser(dbLink, userId)
        .then((user) => {
            masterDbClient.deleteUser(user._self, {}, (err, results) => {
                if (err) deferred.reject(err);
                else deferred.resolve(results);
            });
        })
        .catch((err) => {
            deferred.reject(err);
        });
    return deferred.promise;
};

/**
 * Delete user permissions
 * @param {string} userLink
 * @returns {*|PromiseLike<any>}
 */
const deleteUserPermissions = (userLink) => {
    const deferred = Q.defer();
    getUserPermissions(userLink)
        .then((permissions) => {
            if (permissions.length > 0) {
                Q.all(permissions.map((permission, index) => {
                    masterDbClient.deletePermission(permissions[index]._self, {}, (err, results) => {
                        if (err) return Q.reject(err);
                        else return Q.resolve(results);
                    })
                    }))
                    .then(() => { deferred.resolve(true); })
                    .catch((err) => { deferred.reject(err); })
            } else {
                deferred.resolve(true);
            }
        })
        .catch((err) => {
            deferred.reject(err);
        });

    return deferred.promise;
};

/**
 * Create and add All-type permission for collection
 * @param {string} userLink
 * @param {string} permissionId
 * @param {string} resourceLink
 * @returns {*|PromiseLike<any>}
 */
const createAllPermissionsForCollection = (userLink, permissionId, resourceLink) => {
    const deferred = Q.defer();
    const body = {
        id: permissionId,
        permissionMode: "All",
        resource: resourceLink
    };
    masterDbClient.createPermission(userLink, body, {}, (err, results) => {
        if (err) deferred.reject(err);
        else deferred.resolve(results);
    });
    return deferred.promise;
};

/**
 * Create permissions for partition
 * @param {string} userLink
 * @param {string} permissionId
 * @param {string}resourceLink
 * @param {string}resourcePartitionKey
 * @returns {*|PromiseLike<any>}
 */
const createPermissionsForPartition = (userLink, permissionId, resourceLink, resourcePartitionKey) => {
    const deferred = Q.defer();
    const body = {
        id: permissionId,
        permissionMode: "All",
        resource: resourceLink,
        resourcePartitionKey: [resourcePartitionKey]
    };
    masterDbClient.createPermission(userLink, body, {partitionKey: resourcePartitionKey}, (err, results) => {
        if (err) deferred.reject(err);
        else deferred.resolve(results);
    });
    return deferred.promise;
};

/**
 * Create permissions for Stored Procedure
 * @param {string} userLink
 * @param {string} permissionId
 * @param {string} resourceLink
 * @param {string} partition
 * @returns {*|PromiseLike<any>}
 */
const createPermissionsForSproc = (userLink, permissionId, resourceLink, partition) => {
    const deferred = Q.defer();
    const body = {
        id: permissionId,
        permissionMode: "All",
        resource: resourceLink
    };
    masterDbClient.createPermission(userLink, body, {partitionKey: partition}, (err, results) => {
        if (err) deferred.reject(err);
        else deferred.resolve(results);
    });
    return deferred.promise;
};

/**
 * Update user's partition permission
 * @param {Permission} permission
 * @param {string} partition
 * @returns {*|PromiseLike<any>}
 */
const updateUsersPartitionPermission = (permission, partition) => {
    const deferred = Q.defer();
    const body = {
        id: permission.id,
        permissionMode: permission.permissionMode,
        resource: permission.resource,
        resourcePartitionKey: [partition]
    };
    masterDbClient.replacePermission(permission._self, body,{ partitionKey: partition }, (err, results) => {
        if (err) deferred.reject(err);
        else deferred.resolve(results);
    });
    return deferred.promise;
};
/**
 * Get Stored Procedure
 * @param {string} collectionLink
 * @param {string} sprocId
 * @returns {*|PromiseLike<any>}
 */
const getStoredProcedure = (collectionLink, sprocId) => {
    const deferred = Q.defer();
    const querySpec = {
        query: 'SELECT * FROM sprocs s WHERE s.id = @id',
        parameters: [{
            name: '@id',
            value: sprocId
        }]
    };
    masterDbClient.queryStoredProcedures(collectionLink, querySpec).toArray((err, results) => {
        if (err) deferred.reject(err);
        else deferred.resolve(results[0]);
    });
    return deferred.promise;
};

/**
 * Query all documents from certain partition
 * @param {DocumentDBClient} dbClient
 * @param {string} collLink
 * @param {string} partitionKey
 * @returns {*|PromiseLike<any>}
 */
const queryDocumentsWithPartition = (dbClient, collLink, partitionKey) => {

    const deferred = Q.defer();
    dbClient.queryDocuments(collLink, "SELECT * FROM root", { partitionKey: partitionKey }).toArray((err, results) => {
        if (err) deferred.reject(err);
        else deferred.resolve(results);
    });
    return deferred.promise;
};

/**
 * Query all documents from collection (from all partitions)
 * @param {DocumentDBClient} dbClient
 * @param {string} collLink
 * @returns {*|PromiseLike<any>}
 */
const queryDocuments = (dbClient, collLink) => {
    const deferred = Q.defer();
    dbClient.queryDocuments(collLink, "SELECT * FROM root", { enableCrossPartitionQuery: true }).toArray((err, results) => {
        if (err) deferred.reject(err);
        else deferred.resolve(results);
    });
    return deferred.promise;
};

/**
 * TEST FUNCTIONS
 */

// Store globally for easing data access
let db;
let coll;
let userDbClient;
let testSproc;
let testUser;
let testPermission;

// Get database
console.log("\n*** START ***\n");
console.log("Get database");
getDatabase(config.databaseId)
    .then((database) => {
        db = database;
        console.log("Get collection");
        return getCollection(db._self, config.collectionId);
    })
    .catch((err) => {
        console.log("Database or collection not found: check config and CosmosDb account. Error:", err);
        process.exit(1);
    })
    .then((collection) => {
        coll = collection;
        // (try to) delete Stored proc first
        return deleteStoredProc(config.databaseId, config.collectionId, config.testSprocId);
    })
    .catch((err) => {
        // If there are no such a stored procedure...
        console.log("Delete stored procedure (" + config.testSprocId + ") failed, that might just be OK!");
        console.log(" .. Error = ", err);
        // just continue
        return Q.resolve(true);
    })
    .then((res) => {
        return createStoredProc(config.databaseId, config.collectionId, StoredProcGetDocs);
    })
    .then((res) => {
        // Create test document
        const doc = {data: "dataa", info: "infoo"};
        return createDocument(doc, masterDbClient, coll._self, config.partitionA);
    })
    .then((res) => {
        // Create test document
        const doc = {data: "dataa", info: "infoo"};
        return createDocument(doc, masterDbClient, coll._self, config.partitionB);
    })
    .then((res) => {
        // Create test documents (10)
        console.log("Generate test documents");
        return generateTestDocs(masterDbClient, coll._self, config.partitionB);
    })
    .then((res) => {
        console.log("execute getDocs Sproc : Master :");
        return executeDocsSProc(masterDbClient, db.id, coll.id, config.partitionA, config.testSprocId);
    })
    .then((res) => {
        console.log("MASTER KEY and Partition=" + config.partitionA + " docs : ", res);
        console.log("Get Stored procedure");
        return getStoredProcedure(coll._self, config.testSprocId);
    })
    .then((sproc) => {
        console.log("SPROCS : ", sproc.id);
        testSproc = sproc;
        // get old user
        console.log("Get user : " + config.testuser);
        return getUser(db._self, config.testuser);
    })
    .then((user) => {
        // delete permissions
        console.log("user ", user);
        console.log("Delete user permissions");
        return deleteUserPermissions(user._self);
    })
    .then((user) => {
        // delete old user
        console.log("Delete user: " + config.testuser);
        return deleteUser(db._self, config.testuser);
    })
    .catch( (err) => {
        console.log("Some operation failed, but lets continue : ", err);
        return Q.resolve(true);
    })
    .then((res) => {
        // create new user
        console.log("Create user: " + config.testuser);
        return createUser(db._self, config.testuser);
    })
    .then((user) => {
        testUser = user;
        // NOTE SECURITY ISSUE: IF user gets "All" permission for collection, user is able to run cross-partition query
        // But if user executes stored procedures :
        // https://docs.microsoft.com/en-us/azure/cosmos-db/secure-access-to-data
        //  "In order to run Cosmos DB stored procedures the user must have the All permission
        //   on the collection in which the stored procedure will be run."
        // Well. this does not matter because stored procedures will not work with user db client even with ALL permissions.

        // create All permissions for collection
        // console.log("Create ALL collection permission");
        // return createAllPermissionsForCollection(testUser._self, config.testuser + "_coll_all_permission", coll._self);
        return Q.resolve(true);
    })
    .then((res) => {
        // create permissions for collection
        console.log("Create collection permission");
        return createPermissionsForPartition(testUser._self, config.testuser + "_partition_permission", coll._self, config.partitionB);
    })
    .then((res) => {
        // create permission for stored procedure
        console.log("Create stored procedure permission");
        return createPermissionsForSproc(testUser._self, config.testuser + "_sproc_permission", testSproc._self, config.partitionB);
    })
    .then((res) => {
        console.log("Create documentDb Client for user : ", config.testuser);
        return createUserClient(db._self, config.testuser);
    })
    .then((dbClient) => {
        userDbClient = dbClient;
        return createHashPartitionResolver(userDbClient, db._self, [coll]);
    })
    .then((res) => {
        console.log("\nTest data created, user and permissions created.. wait 3 secs and test...\n");
        const timeout = Q.defer();
        setTimeout(() => {
            timeout.resolve(true);
        }, 3000);
        return timeout.promise;
    })
    .then((res) => {
        console.log("\n*** TEST USER PERMISSION UPDATE *** \n");
        console.log("Get user permissions for update operation");
        return getUserPermissions(testUser._self);
    })
    .then((permissions) => {
        console.log("Update partition permission");
        const index = _.findIndex(permissions, {id: config.testuser + "_partition_permission"});
        if (index !== -1) {
            testPermission = permissions[index];
            return updateUsersPartitionPermission(permissions[index], config.partitionB);
        } else {
            console.log("FAIL ... Permission not found... (" + config.testuser + "_partition_permission)");
            return Q.resolve(true);
        }
    })
    .catch((e) => {
        console.log("FAIL : User permission update failed : ", e);
        return Q.resolve(true);
    })
    .then((res) => {
        // get (updated) permissions for checking...
        return getUserPermissions(testUser._self);
    })
    .then((permissions) => {
        // DEBUG PRINT
        // console.log("User new permission : ", permissions);
        const index = _.findIndex(permissions, {id: config.testuser + "_partition_permission"});
        if (index !== -1) {
            if (testPermission._ts <= permissions[index]._ts) {
                console.log("User permission updated successfully")
            } else {
                console.log("FAIL : user permission timestamp is not updated");
            }
        } else {
            console.log("... FAIL : USER PERMISSION UPDATE FAILED ERROR : not found");
        }
        console.log("\n*** TEST USER PERMISSIONS, create documents ***\n");
        // Create document with User permissions...
        console.log("Create document with user permissions : to partition : ", config.partitionB);
        const doc = {data: "dataa", info: "infoo"};
        return createDocument(doc, userDbClient, coll._self, config.partitionB);
    })
    .then((res) => {
        console.log("... document created to " + config.partitionB + " : ", res.id);
        console.log("THIS MUST FAIL : Create document with user permissions : to partition : ", config.partitionA);
        const doc = {data: "dataa", info: "infoo"};
        return createDocument(doc, userDbClient, coll._self, config.partitionA);
    })
    .then((res) => {
        console.log(" ..SECURITY ISSUE !!!!. document created to " + config.partitionA + " + : ", res.id);
        return Q.resolve(true);
    })
    .catch((e) => {
        console.log("... OK, FAILED : document creation to " + config.partitionA + " failed : ", e);
        console.log("\n*** TEST MASTER KEY SPROC ***\n");
        return executeDocsSProc(masterDbClient, db.id, coll.id, config.partitionA, config.testSprocId);
    })
    .then((res) => {
        const resObj = JSON.parse(res);
        console.log("MASTER KEY SPROC DOCS (amount): ", resObj.docs.length);
        return queryDocuments(masterDbClient, coll._self);
    })
    .then((res) => {
        console.log("MASTER KEY ALL DOCS (Cross partitions) : ", res.length);
        // TEST MASTER KEY : query docs from partition
        return queryDocumentsWithPartition(masterDbClient, coll._self, config.partitionB);
    })
    .then((res) => {
        console.log("MASTER KEY QUERY DOCS (partition, amount) : ", res.length);

        // START TESTING OF USER PERMISSIONS
        console.log("\n*** TEST USER PERMISSIONS ***\n");
        // Query documents from user's valid partition
        return queryDocumentsWithPartition(userDbClient, coll._self, config.partitionB);
    })
    .catch((e) => {
        console.log("Basic query with user permissions from partition failed ", e);
        return Q.resolve([]);
    })
    .then((res) => {
        if (res.length > 0) {
            console.log("USER PERMISSION QUERY DOCS (partition, amount) : ", res.length);
        }
        console.log("THIS WILL FAIL : User permissions, stored procedure");
        return executeDocsSProcTest(userDbClient, db.id, coll.id, config.partitionB, config.testSprocId);
    })
    .then((res) => {
        console.log(" . USER PERMISSION SPROC DOCS (amount) : ", res.length);
        return Q.resolve(true);
    })
    .catch((e) => {
        console.log(" . USER PERMISSION SPROC FAILS (Should not fail): ", e);
        // continue testing
        return Q.resolve(true);
    })
    .then((res) => {
        // Test cross partition query with user permissions
        console.log("USER PERMISSION Cross partition query for all documents.");
        console.log(" . THIS MUST FAIL FOR SECURITY REASONS !");
        return queryDocuments(userDbClient, coll._self);
    })
    .then((res) => {
        console.log(" .. NOT FAILED, MAJOR SECURITY ISSUE! res=", res.length);
        return Q.resolve(true);
    })
    .catch((e) => {
        console.log(" .. User permissions, cross partition query : MUST FAIL : error : ", e);
        return Q.resolve(true);
    })
    .then((res) => {
        // delete all documents
        console.log("delete all documents");
        // return deleteAllDocuments(masterDbClient, db.id, coll);
        // SKIP delete
        return Q.resolve(true);
    })
    .then((res) => {
        console.log("TEST OVER");
    })
    .catch((e) => {
        console.log("FAIL AGAIN : ", e);
        return Q.resolve(true);
    });


