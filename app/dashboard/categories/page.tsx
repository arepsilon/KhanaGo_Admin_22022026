import CategoriesClient from './CategoriesClient';
import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Categories | Admin Dashboard',
    description: 'Manage food categories',
};

export default function CategoriesPage() {
    return <CategoriesClient />;
}
