module.exports = function (models, baseClass) {
  var JournalEntry = baseClass();

  JournalEntry.collection = 'JournalEntries';

  JournalEntry.defaults = {
    characterID: null,
    date: null,
    refID: null,
    refTypeID: null,
    ownerName1: null,
    ownerID1: null,
    ownerName2: null,
    ownerID2: null,
    argName1: null,
    argID1: null,
    amount: null,
    balance: null,
    reason: null,
    taxReceiverID: null,
    taxAmount: null,
    owner1TypeID: null,
    owner2TypeID: null
  };

  JournalEntry.id = function (obj) {
    return obj.refID;
  };

  return JournalEntry;
};
