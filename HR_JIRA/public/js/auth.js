// Frontend Auth Guard (No Globals)

(function () {

  if (!localStorage.getItem('token')) {
    location.href = 'login.html'
  }

})();
