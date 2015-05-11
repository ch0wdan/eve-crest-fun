module.exports = function (models, baseClass) {
  var JournalEntry = baseClass();

  JournalEntry.collection = 'JournalEntries';

  JournalEntry.fields = {
    characterID: {},
    date: {},
    refID: {},
    refTypeID: {},
    ownerName1: {},
    ownerID1: {},
    ownerName2: {},
    ownerID2: {},
    argName1: {},
    argID1: {},
    amount: {},
    balance: {},
    reason: {},
    taxReceiverID: {},
    taxAmount: {},
    owner1TypeID: {},
    owner2TypeID: {}
  };

  JournalEntry.id = function (obj) {
    return obj.refID;
  };

  return JournalEntry;
};
