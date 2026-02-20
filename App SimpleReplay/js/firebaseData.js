/* ═══════════════════════════════════════════
   SimpleReplay — Firebase Data Module
   Saves/loads projects to Firestore
   ═══════════════════════════════════════════ */

const FirebaseData = (() => {
    // Firebase config
    const firebaseConfig = {
        apiKey: "AIzaSyB9CTnhEXXOUAdHpI9Ne23PKzuN8lQtuGQ",
        authDomain: "simplereplay-6a425.firebaseapp.com",
        projectId: "simplereplay-6a425",
        storageBucket: "simplereplay-6a425.firebasestorage.app",
        messagingSenderId: "268601479367",
        appId: "1:268601479367:web:e34f198b194abf4b88aee2"
    };

    // Initialize Firebase (compat SDK)
    firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();

    /**
     * Save a full project to Firestore.
     * If projectId is provided, overwrites that document.
     * Otherwise creates a new one.
     * Returns the projectId.
     */
    async function saveProject(projectId, data) {
        const doc = {
            title: data.title || 'Sin título',
            youtubeVideoId: data.youtubeVideoId || '',
            tagTypes: data.tagTypes || [],
            games: data.games || [],
            clips: data.clips || [],
            playlists: data.playlists || [],
            playlistItems: data.playlistItems || {},
            clipFlags: data.clipFlags || {},
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        };

        // Timeout wrapper to avoid infinite hang
        const timeout = (ms) => new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Tiempo agotado. Verificá tu conexión a internet y que Firestore esté activo.')), ms));

        const doSave = async () => {
            if (projectId) {
                await db.collection('projects').doc(projectId).set(doc, { merge: true });
                return projectId;
            } else {
                doc.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                const ref = await db.collection('projects').add(doc);
                return ref.id;
            }
        };

        return Promise.race([doSave(), timeout(15000)]);
    }

    /**
     * Load a project from Firestore by its ID.
     * Returns the project data or null if not found.
     */
    async function loadProject(projectId) {
        try {
            const snap = await db.collection('projects').doc(projectId).get();
            if (!snap.exists) return null;
            return { id: snap.id, ...snap.data() };
        } catch (err) {
            console.error('Error loading project:', err);
            return null;
        }
    }

    /**
     * Generate a shareable URL for a project.
     */
    function getShareUrl(projectId) {
        const url = new URL(window.location.href);
        url.searchParams.set('project', projectId);
        // Clean up any other params
        return url.origin + url.pathname + '?project=' + projectId;
    }

    /**
     * Get the project ID from the current URL, if any.
     */
    function getProjectIdFromUrl() {
        const params = new URLSearchParams(window.location.search);
        return params.get('project') || null;
    }

    /**
     * List all saved projects (simple query, no auth filter for now).
     */
    async function listProjects() {
        try {
            const snap = await db.collection('projects')
                .orderBy('updatedAt', 'desc')
                .limit(20)
                .get();
            return snap.docs.map(d => ({
                id: d.id,
                title: d.data().title || 'Sin título',
                updatedAt: d.data().updatedAt?.toDate?.() || null,
                youtubeVideoId: d.data().youtubeVideoId || ''
            }));
        } catch (err) {
            console.error('Error listing projects:', err);
            return [];
        }
    }

    return {
        saveProject,
        loadProject,
        listProjects,
        getShareUrl,
        getProjectIdFromUrl
    };
})();
