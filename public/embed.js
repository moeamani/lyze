/* Lyze embed helper: resizes form iframes to fit their content. */
(function () {
  window.addEventListener("message", function (event) {
    var data = event.data;
    if (!data || data.type !== "lyze:resize" || typeof data.height !== "number") return;
    var frames = document.querySelectorAll('iframe[src*="/f/"]');
    for (var i = 0; i < frames.length; i++) {
      if (frames[i].contentWindow === event.source) frames[i].style.height = Math.ceil(data.height) + "px";
    }
  });
})();
