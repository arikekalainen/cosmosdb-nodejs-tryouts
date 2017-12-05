# CosmosDB NodeJs SDK tryout
The purpose is to demo which is really working and which is not
E.g. there are some undocumented "features" with partitioning and permissions.
Note that CosmosDB is evolving rabidly and hopefully some problems will be solved in near future
including the improvements to Node.js SDK for DocumentDB API
https://github.com/Azure/azure-documentdb-node  

## Dependencies (current versions 2017-12-05)
- documentdb: 1.14.1 (https://github.com/Azure/azure-documentdb-node)
- lodash: 4.17.4 (https://github.com/lodash/lodash)
- q: 1.5.1 (https://github.com/kriskowal/q)

## Pre-requisites:
- Install NodeJs (4.x => ) : https://nodejs.org
- Create CosmosDb Account or use CosmosDb emulator
  - CosmosDb emulator : https://docs.microsoft.com/en-us/azure/cosmos-db/local-emulator
- Create Database (id = config.databaseId)
- Create Collection (id = config.collectionId)
  - Size: unlimited
  - PartitionKey: /partition (= config.partitionKey)
- Get authKey and store it to config.authKey
- Get host and store it to config.host

## Executing:
- npm install
- With Real CosmosDb account
  - node index.js
- With CosmosDB emulator (Windows10 command prompt)
  - set NODE_TLS_REJECT_UNAUTHORIZED=0&#38;&#38; node index.js
- With CosmosDB emulator (Windows10 mingw32 etc...)
  - NODE_TLS_REJECT_UNAUTHORIZED=0 node index.js