import { useNavigate } from "react-router-dom";

export default function Home({ user }) {
    const navigate = useNavigate();

    const handleLogout = () => {
        localStorage.removeItem("user");
        navigate("/login");
    };

    return (
        <div>
            <h1>Welcome, {user}</h1>
            <button onClick={handleLogout}>Logout</button>
        </div>
    );
}
