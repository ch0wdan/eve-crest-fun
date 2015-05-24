var $ = require('jquery');
var _ = require('lodash');
var moment = require('moment');

$(document).ready(function () {

  $('.focusSelect').focus(function () { $(this).select(); });

  $(document)
    .delegate('a.showMarketDetails', 'click', function () {
      var el = $(this);
      var type_id = el.data('typeid');
      CCPEVE.showMarketDetails(el.data('typeid'));
      // window.location.href = '/market/type/' + type_id;
      return false;
    })
    .delegate('a.showInfo', 'click', function () {
      var el = $(this);
      CCPEVE.showInfo(el.data('typeid'), el.data('itemid'));
      return false;
    })

  function updateTimes () {
    $('time.moment').each(function () {
      var el = $(this);
      var datetime = el.attr('datetime');
      el.text(moment(datetime).fromNow());
    });
    setTimeout(updateTimes, 1000);
  }
  updateTimes();

  /*
  if ($('body').hasClass('eve-untrusted') && !CCPEVE.mock) {
    CCPEVE.requestTrust(location.href);
    location.reload();
  }
  */

});

/**
* $.parseParams - parse query string paramaters into an object.
*/
(function($) {
  var re = /([^&=]+)=?([^&]*)/g;
  var decodeRE = /\+/g; // Regex for replacing addition symbol with a space
  var decode = function (str) {return decodeURIComponent( str.replace(decodeRE, " ") );};
  $.parseParams = function(query) {
    var params = {}, e;
    while ( e = re.exec(query) ) {
      var k = decode( e[1] ), v = decode( e[2] );
      if (k.substring(k.length - 2) === '[]') {
        k = k.substring(0, k.length - 2);
        (params[k] || (params[k] = [])).push(v);
      }
      else params[k] = v;
    }
    return params;
  };
})($);
