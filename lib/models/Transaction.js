module.exports = function (models, baseClass) {
  var Transaction = baseClass();

  Transaction.collection = 'Transactions';

  Transaction.fields = {
    characterID: {},
    transactionDateTime: {},
    transactionID: {},
    quantity: {},
    typeName: {},
    typeID: {},
    price: {},
    clientID: {},
    clientName: {},
    stationID: {},
    stationName: {},
    transactionType: {},
    transactionFor: {},
    journalTransactionID: {},
    clientTypeID: {}
  };

  Transaction.id = function (obj) {
    return obj.transactionID;
  };

  return Transaction;
};
