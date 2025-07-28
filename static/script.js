document.addEventListener('DOMContentLoaded', () => {
    const addTodoForm = document.getElementById('addTodoForm');
    const newTitleInput = document.getElementById('newTitle');
    const newDescriptionInput = document.getElementById('newDescription');
    const newPrioritySelect = document.getElementById('newPriority');
    const newDueDateInput = document.getElementById('newDueDate');
    const incompleteTodosList = document.getElementById('incompleteTodosList');
    const completedTodosList = document.getElementById('completedTodosList');
    const noTodosMessage = document.getElementById('noTodosMessage');
    const targetLanguageSelect = document.getElementById('targetLanguage');

    let translations = JSON.parse(localStorage.getItem('todoTranslations')) || {};

    // ⭐ IMPORTANT CHANGE: Update API_BASE_URL to include '/api' prefix
    const API_BASE_URL = `${window.location.origin}/api`;

    // Set min date for newDueDateInput
    const today = new Date();
    const year = today.getFullYear();
    const month = (today.getMonth() + 1).toString().padStart(2, '0');
    const day = today.getDate().toString().padStart(2, '0');
    newDueDateInput.min = `${year}-${month}-${day}`;

    async function fetchTodos() {
        try {
            const response = await fetch(`${API_BASE_URL}/todos`); // Changed
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            // Parse each JSON string in the array if the backend returns JSON strings
            // Otherwise, if backend returns actual JSON objects, remove the inner JSON.parse
            const todosData = await response.json();
            // Let's assume the backend now returns proper JSON objects, not strings.
            // If you get errors, you might need: const todos = todosData.map(jsonString => JSON.parse(jsonString));
            const todos = todosData;


            renderTodos(todos);
        } catch (error) {
            console.error("Error fetching todos:", error);
            alert("Could not connect to the backend or fetch todos. Please ensure the Flask backend is running.");
        }
    }

    function renderTodos(todos) {
        incompleteTodosList.innerHTML = '';
        completedTodosList.innerHTML = '';

        const incomplete = todos.filter(todo => !todo.completed);
        const completed = todos.filter(todo => todo.completed);

        if (todos.length === 0) {
            noTodosMessage.style.display = 'block';
        } else {
            noTodosMessage.style.display = 'none';
        }

        incomplete.forEach(todo => appendTodoToDOM(todo, incompleteTodosList));
        completed.forEach(todo => appendTodoToDOM(todo, completedTodosList));
    }

    function appendTodoToDOM(todo, listElement) {
        const li = document.createElement('li');
        li.dataset.todoId = todo.id;
        if (todo.completed) {
            li.classList.add('completed');
        }

        const todoDetails = document.createElement('div');
        todoDetails.classList.add('todo-details');

        const titleSpan = document.createElement('span');
        titleSpan.classList.add('todo-title');
        titleSpan.textContent = `${todo.title}`;
        todoDetails.appendChild(titleSpan);

        if (todo.description) {
            const descriptionSpan = document.createElement('span');
            descriptionSpan.classList.add('todo-description');
            descriptionSpan.innerHTML = `<br><em>${todo.description}</em>`;
            todoDetails.appendChild(descriptionSpan);
        }
        if (todo.priority) {
            const prioritySpan = document.createElement('span');
            prioritySpan.classList.add('todo-priority');
            prioritySpan.innerHTML = `<br><strong>Priority:</strong> ${todo.priority}`;
            todoDetails.appendChild(prioritySpan);
        }
        if (todo.due_date) {
            const dueDateSpan = document.createElement('span');
            dueDateSpan.classList.add('todo-due-date');
            dueDateSpan.innerHTML = `<br><strong>Due:</strong> ${todo.due_date}`;
            todoDetails.appendChild(dueDateSpan);
        }

        const currentTargetLanguage = targetLanguageSelect.value;
        if (translations[todo.id] && translations[todo.id][currentTargetLanguage]) {
            const translatedTextSpan = document.createElement('span');
            translatedTextSpan.classList.add('translated-text');
            translatedTextSpan.innerHTML = `<br><strong>Translated (${currentTargetLanguage}):</strong> <em>${translations[todo.id][currentTargetLanguage]}</em>`;
            todoDetails.appendChild(translatedTextSpan);
        }

        li.appendChild(todoDetails);

        const todoActions = document.createElement('div');
        todoActions.classList.add('todo-actions');

        if (!todo.completed) {
            const completeButton = document.createElement('button');
            completeButton.textContent = 'Mark Completed';
            completeButton.classList.add('mark-complete-btn');
            completeButton.addEventListener('click', () => markTodoCompleted(todo.id));
            todoActions.appendChild(completeButton);
        }

        const translateButton = document.createElement('button');
        translateButton.textContent = `Translate to ${currentTargetLanguage}`;
        translateButton.classList.add('translate-btn');
        translateButton.addEventListener('click', () => translateTodo(todo));
        todoActions.appendChild(translateButton);

        const deleteButton = document.createElement('button');
        deleteButton.textContent = 'Delete';
        deleteButton.classList.add('delete-btn');
        deleteButton.addEventListener('click', () => deleteTodo(todo.id));
        todoActions.appendChild(deleteButton);

        li.appendChild(todoActions);
        listElement.appendChild(li);
    }

    addTodoForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const title = newTitleInput.value.trim();
        const description = newDescriptionInput.value.trim();
        const priority = newPrioritySelect.value === 'None' ? null : newPrioritySelect.value;
        const dueDate = newDueDateInput.value || null; // Will be "YYYY-MM-DD" or null

        if (!title) {
            alert("Please enter a title for the To-Do item.");
            return;
        }

        const todoData = {
            title: title,
            description: description || null,
            priority: priority,
            due_date: dueDate
        };

        try {
            const response = await fetch(`${API_BASE_URL}/todos`, { // Changed
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(todoData),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`HTTP error! status: ${response.status}, Detail: ${errorData.detail}`);
            }

            alert("To-Do item added successfully!");
            newTitleInput.value = '';
            newDescriptionInput.value = '';
            newPrioritySelect.value = 'None';
            newDueDateInput.value = '';
            fetchTodos(); // Refresh the list
        } catch (error) {
            console.error("Error adding todo:", error);
            alert(`Error adding todo: ${error.message}`);
        }
    });

    async function markTodoCompleted(todoId) {
        try {
            const response = await fetch(`${API_BASE_URL}/todos/${todoId}`, { // Changed
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ completed: true }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`HTTP error! status: ${response.status}, Detail: ${errorData.detail}`);
            }

            alert(`To-Do item ${todoId} marked as completed!`);
            fetchTodos(); // Refresh the list
        } catch (error) {
            console.error("Error marking todo as completed:", error);
            alert(`Error marking todo as completed: ${error.message}`);
        }
    }

    async function deleteTodo(todoId) {
        if (!confirm("Are you sure you want to delete this To-Do item?")) {
            return;
        }
        try {
            const response = await fetch(`${API_BASE_URL}/todos/${todoId}`, { // Changed
                method: 'DELETE',
            });

            if (response.status === 204) {
                alert(`To-Do item ${todoId} deleted successfully!`);
                delete translations[todoId];
                localStorage.setItem('todoTranslations', JSON.stringify(translations));
                fetchTodos(); // Refresh the list
            } else if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`HTTP error! status: ${response.status}, Detail: ${errorData.detail}`);
            }
        } catch (error) {
            console.error("Error deleting todo:", error);
            alert(`Error deleting todo: ${error.message}`);
        }
    }

    async function translateTodo(todo) {
        const targetLanguage = targetLanguageSelect.value;
        let textToTranslate = todo.title;
        if (todo.description) {
            textToTranslate += ` (Description: ${todo.description})`;
        }
        if (todo.priority) {
            textToTranslate += ` (Priority: ${todo.priority})`;
        }
        if (todo.due_date) {
            textToTranslate += ` (Due Date: ${todo.due_date})`;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/translate`, { // Changed
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ text: textToTranslate, target_language: targetLanguage }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`HTTP error! status: ${response.status}, Detail: ${errorData.detail}`);
            }

            const data = await response.json();
            const translatedText = data.translated_text; // Assuming backend now sends proper JSON object

            if (!translations[todo.id]) {
                translations[todo.id] = {};
            }
            translations[todo.id][targetLanguage] = translatedText;
            localStorage.setItem('todoTranslations', JSON.stringify(translations));
            fetchTodos(); // Re-render to show translation
        } catch (error) {
            console.error("Error translating text:", error);
            alert(`Error translating text: ${error.message}. Check backend logs for details.`);
        }
    }

    targetLanguageSelect.addEventListener('change', () => {
        fetchTodos();
    });

    fetchTodos();
});