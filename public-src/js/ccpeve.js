if (typeof CCPEVE == 'undefined') {

    var CCPEVE = window.CCPEVE = {
        mock: true
    };

    /*
    CCPEVE.showMarketDetails = function (type_id) {
        window.location.href = '/market/type/' + type_id;
    };
    */

    var stub_names = [
        'requestTrust',
        'showMarketDetails',
        'showInfo'
    ];

    for (var i=0; i<stub_names.length; i++) {
        (function (name) {
            if (name in CCPEVE) { return; }
            CCPEVE[name] = function () {
                var args = JSON.stringify(Array.prototype.slice.apply(arguments));
                console.log("CCPEVE."+name+" "+args);
            }
        })(stub_names[i]);
    }

}
