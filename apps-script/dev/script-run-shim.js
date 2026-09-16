/**
 * Drop-in replacement for `google.script.run` when running outside Apps
 * Script. Index.html is used completely unmodified — this file is injected
 * before it by the dev server so `google.script.run.xyz(...)` calls become
 * POST /__api__/xyz requests instead.
 */
(function () {
  function createRun() {
    var successHandler = null;
    var failureHandler = null;

    var proxy = new Proxy({}, {
      get: function (_target, name) {
        if (name === 'withSuccessHandler') {
          return function (fn) { successHandler = fn; return proxy; };
        }
        if (name === 'withFailureHandler') {
          return function (fn) { failureHandler = fn; return proxy; };
        }

        return function () {
          var args = Array.prototype.slice.call(arguments);
          fetch('/__api__/' + name, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ args: args })
          })
            .then(function (res) {
              return res.json().then(function (body) {
                if (!res.ok) throw new Error(body.message || 'Request failed');
                return body;
              });
            })
            .then(function (data) {
              if (successHandler) successHandler(data);
            })
            .catch(function (err) {
              if (failureHandler) failureHandler(err);
              else console.error(err);
            });
        };
      }
    });

    return proxy;
  }

  window.google = { script: { run: createRun() } };
})();
