import axios from 'axios';

if (typeof window !== 'undefined') {
    window.axios = axios;

    window.axios.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest';
    window.axios.defaults.withCredentials = true;
    window.axios.defaults.withXSRFToken = true;
}
