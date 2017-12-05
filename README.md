# CosmosDB NodeJs SDK tryout
The purpose is to demo which is really working and which is not

## pre-requisites:
Install NodeJs (4.x => )
Create CosmosDb Account or use CosmosDb emulator
Create Database (id = config.databaseId)
Create Collection (id = config.collectionId)
-- Size: unlimited
-- PartitionKey: /partition (= config.partitionKey)
Get authKey and store it to config.authKey
Get host and store it to config.host

## Executing:
- ```npm install```
- With Real CosmosDb account ```node index.js```
- With CosmosDB emulator ```set NODE_TLS_REJECT_UNAUTHORIZED=0 &38;&38; node index.js```
