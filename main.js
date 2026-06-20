// Portal Home Interactions
document.addEventListener("DOMContentLoaded", () => {
    console.log("PROA IA - Portal de Inteligencia Artificial inicializado.");
    
    // Suavizar el scroll al hacer clic en enlaces internos
    const smoothLinks = document.querySelectorAll('a[href^="#"]');
    for (let link of smoothLinks) {
        link.addEventListener("click", function(e) {
            e.preventDefault();
            const targetId = this.getAttribute("href");
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                targetElement.scrollIntoView({
                    behavior: "smooth"
                });
            }
        });
    }
});
