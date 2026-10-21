export const validarNombre = (input) => {
    const value = input.value.trim();
    const errorSpan = document.getElementById('error-nombre');
    const regex = /^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/;

    if (value.length < 5) {
        errorSpan.textContent = 'El nombre debe tener al menos 5 caracteres.';
        return false;
    }

    if (!regex.test(value)) {
        errorSpan.textContent = 'El nombre solo puede contener letras.';
        return false;
    }

    errorSpan.textContent = '';
    return true;
};

export const validarEmail = (input) => {
    const value = input.value.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    let errorSpan = input.nextElementSibling;

    if (!emailRegex.test(value)) {
        if (!errorSpan || !errorSpan.classList.contains('error-mensaje')) {
            const newErrorSpan = document.createElement('span');
            newErrorSpan.classList.add('error-mensaje');
            input.parentNode.insertBefore(newErrorSpan, input.nextSibling);
            errorSpan = newErrorSpan;
        }
        errorSpan.textContent = 'Correo electrónico inválido.';
        return false;
    }

    if (errorSpan && errorSpan.classList.contains('error-mensaje')) {
        errorSpan.textContent = '';
    }
    return true;
};