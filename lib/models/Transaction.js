module.exports = function (models, baseClass) {
  var Transaction = baseClass();

  Transaction.collection = 'Transactions';

  Transaction.defaults = {
    characterID: null,
    transactionDateTime: null,
    transactionID: null,
    quantity: null,
    typeName: null,
    typeID: null,
    price: null,
    clientID: null,
    clientName: null,
    stationID: null,
    stationName: null,
    transactionType: null,
    transactionFor: null,
    journalTransactionID: null,
    clientTypeID: null
  };

  Transaction.id = function (obj) {
    return obj.transactionID;
  };

  return Transaction;
};
