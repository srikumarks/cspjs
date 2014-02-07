// This file is a port of the benchmark written for bluebird
// https://github.com/petkaantonov/bluebird/tree/master/benchmark/doxbee-sequential-errors
// It requires 'state_machine.js' to be in ../node_modules

require('../lib/fakes');

task upload(stream, idOrPath, tag) {
    var blob = blobManager.create(account),
        tx = db.begin();
    catch (err) {
        tx.rollback();
    }
    blobId <- blob.put(stream);
    file <- self.byUuidOrPath(idOrPath).get();
    var previousId = file ? file.version : null;
    version = {
        userAccountId: userAccount.id,
        date: new Date(),
        blobId: blobId,
        creatorId: userAccount.id,
        previousId: previousId,
    };
    version.id = Version.createHash(version);
    await Version.insert(version).execWithin(tx); 
    triggerIntentionalError();
    if (!file) {
        var splitPath = idOrPath.split('/');
        var fileName = splitPath[splitPath.length - 1];
        file = {
            id: uuid.v1(),
            userAccountId: userAccount.id,
            name: fileName,
            version: version.id
        };
        query <- self.createQuery(idOrPath, file);
        await query.execWithin(tx);
        triggerIntentionalError();
    }
    await FileVersion.insert({fileId: file.id, versionId: version.id})
        .execWithin(tx);
    triggerIntentionalError();
    await File.whereUpdate({id: file.id}, {version: version.id})
        .execWithin(tx);
    triggerIntentionalError();
    tx.commit();
}

module.exports = upload;
